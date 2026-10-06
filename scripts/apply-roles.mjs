/**
 * Applies the Step 5 roles (roles.csv) to the Image collection.
 *
 * Replaces scripts/flag-reference-images.mjs, which picked reference images at
 * random. Roles now come from the stratified, hand-checked assignment in
 * thesis scripts/mapillary/data/step5/roles.csv (decided 30 Sep 2026):
 *   model_dev   poolStatus "model_dev", isReference false   (annotators only)
 *   reference   poolStatus "served",    isReference true    (annotators and contributors)
 *   deployment  poolStatus "served",    isReference false   (contributors only)
 *   reserve     poolStatus "reserve",   isReference false   (nobody, until promoted)
 *
 * Refuses unless every image in the collection appears exactly once in the file
 * and every image is still "unserved", so it runs once, on a fresh import.
 *
 * Options:
 *   --file <path>     roles.csv (required)
 *   --expect <spec>   e.g. model_dev=1002,reference=150,deployment=525,reserve=1010
 *   --dry-run         check and report, write nothing
 *
 * Usage:
 *   MONGODB_URI=... MONGODB_DB=imprint node scripts/apply-roles.mjs --file <path> --expect ... --dry-run
 */
import { MongoClient } from "mongodb";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  ROLE_FIELDS, ROLES, parseRolesCsv, parseExpectedCounts, validateRoleRows, planRoleUpdates, verifyAppliedRoles,
} from "../src/util/validators/roleAssignment.mjs";

const { values } = parseArgs({
  options: {
    file: { type: "string" },
    expect: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

if (!values.file) {
  console.error("--file <path to roles.csv> is required");
  process.exit(1);
}
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;
if (!uri || !dbName) {
  console.error("MONGODB_URI and MONGODB_DB must be set.");
  process.exit(1);
}

const raw = await readFile(values.file);
const sha256 = createHash("sha256").update(raw).digest("hex");
let rows;
let expected = {};
try {
  rows = parseRolesCsv(raw.toString("utf-8"));
  if (values.expect) expected = parseExpectedCounts(values.expect);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const { problems: rowProblems, counts } = validateRoleRows(rows, expected);
console.log(`File:    ${values.file}`);
console.log(`SHA-256: ${sha256}`);
console.log(`Rows:    ${rows.length}  ${JSON.stringify(counts)}`);
console.log(`Target:  database "${dbName}", collection "Image"`);
if (rowProblems.length > 0) {
  console.error(`\n${rowProblems.length} problem(s) in the file. Nothing written. First 20:`);
  for (const p of rowProblems.slice(0, 20)) console.error(`  ${p}`);
  process.exit(1);
}

const project = { projection: { _id: 0, imageName: 1, poolStatus: 1, isReference: 1 } };
const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);
  const coll = db.collection("Image");

  const before = await coll.find({}, project).toArray();
  const { problems, byRole } = planRoleUpdates(rows, before);
  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s) against the database. Nothing written. First 20:`);
    for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
    process.exitCode = 1;
  } else if (values["dry-run"]) {
    console.log(`\nAll ${before.length} images are in the file and still "unserved". Dry run: nothing written.`);
    for (const role of ROLES) console.log(`  ${role.padEnd(11)} ${String(byRole[role].length).padStart(5)} -> ${JSON.stringify(ROLE_FIELDS[role])}`);
  } else {
    for (const role of ROLES) {
      const names = byRole[role];
      if (names.length === 0) continue;
      const res = await coll.updateMany(
        { imageName: { $in: names }, poolStatus: "unserved" },
        { $set: { ...ROLE_FIELDS[role] } }
      );
      console.log(`  ${role.padEnd(11)} matched ${res.matchedCount}, modified ${res.modifiedCount}`);
      if (res.matchedCount !== names.length) {
        console.error(`  expected ${names.length} for ${role}. Stopping; check the collection.`);
        process.exitCode = 1;
        break;
      }
    }
    const after = await coll.find({}, project).toArray();
    const mismatches = verifyAppliedRoles(rows, after);
    const summary = await coll.aggregate([
      { $group: { _id: { poolStatus: "$poolStatus", isReference: "$isReference" }, n: { $sum: 1 } } },
      { $sort: { "_id.poolStatus": 1, "_id.isReference": 1 } },
    ]).toArray();
    console.log("\nImage collection now:");
    for (const s of summary) console.log(`  poolStatus ${String(s._id.poolStatus).padEnd(10)} isReference ${String(s._id.isReference).padEnd(5)} ${s.n}`);
    if (mismatches.length > 0) {
      console.error(`\n${mismatches.length} image(s) do not carry their role (for example ${mismatches[0]}).`);
      process.exitCode = 1;
    } else if (!process.exitCode) {
      await db.collection("telemetry_logs").insertOne({
        event: "ROLES_APPLIED",
        counts,
        sourceFile: values.file.split("/").pop(),
        sourceSha256: sha256,
        timestamp: new Date(),
      });
      console.log(`\nVerified: all ${rows.length} images carry their role.`);
    }
  }
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
