/**
 * Sets the suggestion threshold τ (S2, 29 Oct 2026): only suggestions with a
 * detector confidence at or above it are shown (chapter_4.tex line 180). It
 * is chosen on the validation-set precision-recall curve at precision 0.80
 * (D7), once per detector.
 *
 * Writes the `settings` document { _id: "tau", value, modelVersion, chosenAt,
 * validationPrecision, validationRecall } and logs TAU_CHANGED to
 * telemetry_logs with who ran it, the old value and the new
 * (src/util/validators/tauSetting.mjs). Sessions started after the write show
 * the new τ, with no deploy. A session already open keeps the τ it started
 * with, so nothing it showed changes under it.
 *
 * Without --apply it only checks the arguments and prints the stored value
 * and the new one, and writes nothing.
 *
 * Options:
 *   --value <0 to 1>        The threshold (required)
 *   --model-version <name>  The detector it was chosen for, as det-v1-rfdetr-small (required)
 *   --precision <0 to 1>    Validation precision at this threshold (required)
 *   --recall <0 to 1>       Validation recall at this threshold (required)
 *   --by <name>             Who is setting it, for TAU_CHANGED (default: this
 *                           computer's user name). Never printed.
 *   --apply                 Write it
 *
 * Usage:
 *   node --env-file=.env scripts/set-tau.mjs --value 0.43 --model-version det-v1-rfdetr-small --precision 0.80 --recall 0.71
 *   node --env-file=.env scripts/set-tau.mjs --value 0.43 --model-version det-v1-rfdetr-small --precision 0.80 --recall 0.71 --apply
 */
import { MongoClient } from "mongodb";
import { parseArgs } from "node:util";
import { userInfo } from "node:os";
import { validateTauArgs, runSetTau, tauSummary } from "../src/util/validators/tauSetting.mjs";

const { values } = parseArgs({
  options: {
    value: { type: "string" },
    "model-version": { type: "string" },
    precision: { type: "string" },
    recall: { type: "string" },
    by: { type: "string" },
    apply: { type: "boolean", default: false },
  },
});

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  console.error("MONGODB_URI and MONGODB_DB must be set. Try: node --env-file=.env scripts/set-tau.mjs --value 0.43 --model-version det-v1-rfdetr-small --precision 0.80 --recall 0.71");
  process.exit(1);
}

const args = {
  value: values.value,
  modelVersion: values["model-version"],
  precision: values.precision,
  recall: values.recall,
};
const problems = validateTauArgs(args);
if (problems.length > 0) {
  console.error(`${problems.length} problem(s). Nothing was written.`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

let changedBy = values.by;
if (!changedBy) {
  try {
    changedBy = userInfo().username;
  } catch {
    changedBy = null;
  }
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  console.log(`Connected to ${dbName}\n`);

  const { previous, next, written } = await runSetTau(db, args, { apply: values.apply, changedBy });
  const before = tauSummary(previous);

  console.log(before.isDefault
    ? `  Stored: none, so the default ${before.value} is in use`
    : `  Stored: ${before.value} for ${before.modelVersion ?? "an unnamed detector"}`);
  console.log(`  New:    ${next.value} for ${next.modelVersion} (validation precision ${next.validationPrecision}, recall ${next.validationRecall})`);
  console.log(written
    ? "\n  ✓ Written, and TAU_CHANGED logged to telemetry_logs. Sessions started from now on use it."
    : "\n  (no --apply, nothing written)");
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
