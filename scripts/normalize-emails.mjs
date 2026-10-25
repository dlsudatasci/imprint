/**
 * Lowercases and trims every stored email address (S9, email verification).
 *
 * From S9 on, register, sign-in, the password reset and the Google onboarding
 * compare and store addresses trimmed and lowercased, so the unique index on
 * users.email allows one account per address whatever its case. This brings
 * the accounts made before that in line.
 *
 * Run it before deploying S9, then once more after (it should find 0). It
 * refuses, even with --apply, when two accounts would end up with the same
 * address, and says only how many addresses collide. Without --apply it only
 * counts. It prints counts only, never an address or a username.
 *
 * Usage:
 *   node --env-file=.env scripts/normalize-emails.mjs
 *   node --env-file=.env scripts/normalize-emails.mjs --apply
 */
import { MongoClient } from "mongodb";
import { parseArgs } from "node:util";
import { normalizeEmails } from "../src/util/validators/emailMigration.mjs";

const { values } = parseArgs({ options: { apply: { type: "boolean", default: false } } });

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;
if (!uri || !dbName) {
  console.error("MONGODB_URI and MONGODB_DB must be set. Try: node --env-file=.env scripts/normalize-emails.mjs");
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  console.log(`Connected to ${dbName}.${values.apply ? "" : " Counting only."}\n`);
  const result = await normalizeEmails(client.db(dbName), { apply: values.apply });
  if (result.refused) process.exitCode = 1;
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
