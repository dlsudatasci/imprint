/**
 * Promotes (or demotes) a user to a given role.
 *
 * Usage:
 *   node --env-file=.env scripts/set-role.mjs --email someone@example.com --role annotator --pass 2
 *
 * --email   The user's email address (looked up in the users collection)
 * --role    One of: user, annotator, admin
 * --pass    (annotator only) Which annotation pass this person is doing (integer ≥ 1)
 *
 * What it writes:
 *   role            "user" | "annotator" | "admin"
 *   annotatorPass   integer (only when role is annotator)
 *   annotatorActive true    (only when role is annotator)
 *   updatedAt       current timestamp
 *
 * Safe to re-run — it's an update, not an insert.
 */
import { MongoClient } from "mongodb";
import { parseArgs } from "node:util";

const VALID_ROLES = ["user", "annotator", "admin"];

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    role:  { type: "string" },
    pass:  { type: "string" },
  },
});

const { email, role, pass } = values;

if (!email || !role) {
  console.error("Usage: node --env-file=.env scripts/set-role.mjs --email <email> --role <role> [--pass <n>]");
  process.exit(1);
}

if (!VALID_ROLES.includes(role)) {
  console.error(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}`);
  process.exit(1);
}

if (role === "annotator" && !pass) {
  console.error("--pass is required when setting role to annotator (e.g. --pass 1)");
  process.exit(1);
}

const passNum = pass ? Number(pass) : null;
if (role === "annotator" && (!Number.isInteger(passNum) || passNum < 1)) {
  console.error("--pass must be a positive integer");
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  console.error("MONGODB_URI and MONGODB_DB must be set. Try: node --env-file=.env scripts/set-role.mjs ...");
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);

  const update = {
    $set: {
      role,
      updatedAt: new Date(),
    },
  };

  if (role === "annotator") {
    update.$set.annotatorPass = passNum;
    update.$set.annotatorActive = true;
  } else {
    update.$unset = { annotatorPass: "", annotatorActive: "" };
  }

  const result = await db.collection("users").updateOne({ email }, update);

  if (result.matchedCount === 0) {
    console.error(`No user found with email "${email}".`);
    process.exit(1);
  }

  console.log(`✓ ${email} → role: ${role}${role === "annotator" ? `, pass: ${passNum}` : ""}`);
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
