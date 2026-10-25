/**
 * Marks the accounts made before email verification (S9) as confirmed, with
 * emailVerifiedAt set to the date each signed up (createdAt, or the time in its
 * id when that is missing).
 *
 * Those accounts are annotators, admins and contributors from testing, and
 * none was ever sent a link. They are exactly the accounts with no
 * emailVerifiedAt field: every account made by the S9 code has one, null until
 * confirmed or a date. Pilot accounts (S11, isPilot) are left alone, so pilot
 * participants confirm by email like any contributor.
 *
 * Run it right after deploying S9: until then those contributors cannot
 * annotate. Safe to run again. Without --apply it only counts. It prints counts
 * only, never an address or a username.
 *
 * Usage:
 *   node --env-file=.env scripts/verify-existing-emails.mjs
 *   node --env-file=.env scripts/verify-existing-emails.mjs --apply
 */
import { MongoClient } from "mongodb";
import { parseArgs } from "node:util";
import { verifyExistingEmails } from "../src/util/validators/emailMigration.mjs";

const { values } = parseArgs({ options: { apply: { type: "boolean", default: false } } });

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;
if (!uri || !dbName) {
  console.error("MONGODB_URI and MONGODB_DB must be set. Try: node --env-file=.env scripts/verify-existing-emails.mjs");
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  console.log(`Connected to ${dbName}.${values.apply ? "" : " Counting only."}\n`);
  await verifyExistingEmails(client.db(dbName), { apply: values.apply });
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
