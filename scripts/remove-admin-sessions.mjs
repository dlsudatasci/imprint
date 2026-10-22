/**
 * Removes an admin account's own annotation sessions and everything they
 * recorded, keeping the account itself (22 Oct 2026).
 *
 * An admin who annotates, to see what contributors see, is treated as a
 * contributor: their answers are stored as contributor data and counted in
 * the home page figures, each photo's annotationCount, the quality checks
 * and the exports. The Accounts tab cannot delete an admin, so this is the
 * way to take that test data out.
 *
 * Removes, for that account only:
 *   annotations                 every answer it gave
 *   sessions                    every session, active, stopped or finished
 *   telemetry_logs              session events only (SESSION_EVENTS in
 *                               src/util/validators/sessionCleanup.mjs); the
 *                               admin's own actions, such as ROLE_CHANGED, are kept
 *   nasa_tlx, exit_surveys      its questionnaire answers
 * and puts back:
 *   Image.annotationCount       less what its sessions added, never below 0
 *   Image.referenceGroundTruth  any entry of its (only annotators' answers are
 *                               copied there, so normally none)
 *   users                       totalAnnotations 0, and the session lines
 *                               taken out of its activity list
 *
 * Only an account whose role is admin. For anyone else, delete the account
 * from the admin Accounts tab. Without --apply it only counts and changes
 * nothing. After --apply it counts again, and everything should be 0.
 *
 * Usage:
 *   node --env-file=.env scripts/remove-admin-sessions.mjs --username <name>
 *   node --env-file=.env scripts/remove-admin-sessions.mjs --username <name> --apply
 */
import { MongoClient, ObjectId } from "mongodb";
import { parseArgs } from "node:util";
import {
  SESSION_EVENTS, SESSION_ACTIVITY_TAGS, ownedFilter, annotationCountReversal, decrementCount,
} from "../src/util/validators/sessionCleanup.mjs";

const { values } = parseArgs({
  options: {
    username: { type: "string" },
    apply: { type: "boolean", default: false },
  },
});

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  console.error("MONGODB_URI and MONGODB_DB must be set. Try: node --env-file=.env scripts/remove-admin-sessions.mjs --username <name>");
  process.exit(1);
}
if (!values.username) {
  console.error("Usage: node --env-file=.env scripts/remove-admin-sessions.mjs --username <name> [--apply]");
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);

  const user = await db.collection("users").findOne({ username: values.username }, { projection: { _id: 1, username: 1, role: 1 } });
  if (!user) {
    console.error(`No account with the username "${values.username}".`);
    process.exit(1);
  }
  if (user.role !== "admin") {
    console.error(`"${user.username}" is not an admin (role: ${user.role ?? "user"}). Delete other accounts from the admin Accounts tab.`);
    process.exit(1);
  }

  const owned = ownedFilter(user, ObjectId);
  const id = String(user._id);
  const filters = {
    annotations: owned,
    sessions: owned,
    telemetry_logs: { $and: [owned, { event: { $in: [...SESSION_EVENTS] } }] },
    nasa_tlx: owned,
    exit_surveys: owned,
  };
  const referenceFilter = { "referenceGroundTruth.userId": { $in: [id, new ObjectId(id)] } };

  const count = async () => {
    const counts = {};
    for (const [name, filter] of Object.entries(filters)) counts[name] = await db.collection(name).countDocuments(filter);
    counts.referenceImages = await db.collection("Image").countDocuments(referenceFilter);
    return counts;
  };

  console.log(`Connected to ${dbName}. Account "${user.username}" (admin)${values.apply ? "" : ", counting only: add --apply to remove"}\n`);
  const before = await count();
  for (const [name, n] of Object.entries(before)) console.log(`  ${name.padEnd(16)} ${n}`);

  const sessions = await db.collection("sessions").find(owned, { projection: { status: 1, imageIDs: 1, completedImageIDs: 1 } }).toArray();
  const { byId, byImageID } = annotationCountReversal(sessions);
  const countOps = [
    ...byId.map(([value, n]) => decrementCount({ _id: value }, n)),
    ...byImageID.map(([value, n]) => decrementCount({ imageID: value }, n)),
  ];
  console.log(`  ${"annotationCount".padEnd(16)} ${countOps.length} photos to take back what these sessions added`);

  if (!values.apply) {
    console.log("\nNothing was changed.");
  } else {
    // The counts first, while the sessions that say what was added still exist
    if (countOps.length > 0) await db.collection("Image").bulkWrite(countOps, { ordered: false });
    await db.collection("Image").updateMany(referenceFilter, { $pull: { referenceGroundTruth: { userId: { $in: [id, new ObjectId(id)] } } } });
    for (const [name, filter] of Object.entries(filters)) await db.collection(name).deleteMany(filter);
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { totalAnnotations: 0 }, $pull: { activities: { tag: { $in: [...SESSION_ACTIVITY_TAGS] } } } }
    );

    const after = await count();
    const left = Object.values(after).reduce((a, b) => a + b, 0);
    console.log(left === 0 ? "\n✓ Removed. Nothing of these sessions is left." : `\nSome records remain: ${JSON.stringify(after)}`);
    if (left !== 0) process.exitCode = 1;
  }
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
