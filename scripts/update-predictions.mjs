/**
 * Writes the obstruction classifier's proposed judgments into the Image
 * records after a retraining cycle, and sets each image's modelVersion so new
 * sessions serve, and annotations record, the retrained model (16 Oct 2026).
 *
 * Only the proposals change. Each suggestion an image already has keeps its
 * id, category, box and confidence, and gains `proposedObstructs` and
 * `obstructionProbability`. The detector's boxes are written once, before
 * deployment, and never change (chapter_4.tex and chapter_5.tex, Human-in-the-
 * Loop Workflow). Until 16 Oct 2026 this script replaced every image's
 * suggestions with new boxes and new ids ("pred-0", "pred-1" ...), which that
 * rules out, and which would have lost the answers of resumed sessions
 * (annotationGet merges them by box id) and refused annotators' submissions
 * (annotationSubmit checks the ids against the image).
 *
 * The input file and every check are described in
 * src/util/validators/predictionUpdate.mjs. In short: every image in the file
 * must exist, every suggestion of each image must get exactly one proposal,
 * each proposal must agree with the decision threshold, and every image
 * served to contributors must be in the file, since the whole pool is
 * recomputed each cycle. If anything fails, nothing is written.
 *
 * It never writes while any session is active (S5, 29 Oct 2026).
 * annotationSubmit stores each contributor answer with the image record's
 * modelVersion, so an image updated under an open session would label the
 * answers given on the old model's proposals with the new model. With
 * --apply it counts the sessions whose status is "active" just before
 * writing, and if there are any it prints only their number, writes nothing
 * and exits with code 1. There is no option to override it: wait for the
 * sessions to end. Without --apply the same count is printed as a warning.
 *
 * Without --apply it only checks and reports, and writes nothing.
 *
 * Options:
 *   --input <file>     Path to the predictions JSON (required)
 *   --apply            Write the update (refused while any session is active)
 *   --dry-run          The default, check and report without writing (still
 *                      accepted, so older command lines never write)
 *   --force            Write images already at this modelVersion too
 *   --allow-partial    Allow served images to be missing from the file (to
 *                      finish a run that was split on purpose)
 *
 * Usage:
 *   node --env-file=.env scripts/update-predictions.mjs --input predictions.json
 *   node --env-file=.env scripts/update-predictions.mjs --input predictions.json --apply
 */
import { MongoClient } from "mongodb";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import {
  SERVED_POOL_STATUS,
  validatePredictionFile,
  planPredictionUpdate,
  runPredictionUpdate,
} from "../src/util/validators/predictionUpdate.mjs";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    apply: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    "allow-partial": { type: "boolean", default: false },
  },
});

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  console.error("MONGODB_URI and MONGODB_DB must be set. Try: node --env-file=.env scripts/update-predictions.mjs --input predictions.json");
  process.exit(1);
}

if (values.apply && values["dry-run"]) {
  console.error("--apply and --dry-run cannot be used together. Leave out --dry-run to write.");
  process.exit(1);
}

if (!values.input) {
  console.error("--input <file> is required. Point it at the JSON file from the retraining pipeline.");
  process.exit(1);
}

let data;
try {
  data = JSON.parse(await readFile(values.input, "utf-8"));
} catch (err) {
  console.error(`Cannot read ${values.input}: ${err.message}`);
  process.exit(1);
}

const fileProblems = validatePredictionFile(data);
if (fileProblems.length > 0) {
  console.error(`The file has ${fileProblems.length} problem(s). Nothing was written.`);
  for (const p of fileProblems.slice(0, 30)) console.error(`  - ${p}`);
  if (fileProblems.length > 30) console.error(`  ... and ${fileProblems.length - 30} more`);
  process.exit(1);
}

const { modelVersion, decisionThreshold, predictions } = data;
console.log(`File checked: ${predictions.length} image(s) for model ${modelVersion}, decision threshold ${decisionThreshold}`);

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  const imageColl = db.collection("Image");
  console.log(`Connected to ${dbName}\n`);

  // Every image in the file, and every image served to contributors (to check the whole pool is covered)
  const images = await imageColl
    .find(
      { $or: [{ imageID: { $in: predictions.map((p) => p.imageID) } }, { poolStatus: SERVED_POOL_STATUS }] },
      { projection: { imageID: 1, modelVersion: 1, poolStatus: 1, annotationList: 1 } }
    )
    .toArray();

  const { problems, updates, counts } = planPredictionUpdate(data, images, {
    force: values.force,
    allowPartial: values["allow-partial"],
  });

  if (problems.length > 0) {
    console.error(`${problems.length} problem(s). Nothing was written.`);
    for (const p of problems.slice(0, 30)) console.error(`  - ${p}`);
    if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
    process.exitCode = 1;
  } else {
    // The active sessions are counted just before writing, and any refuses it
    const run = await runPredictionUpdate(db, { data, updates, counts }, {
      apply: values.apply,
      partial: values["allow-partial"],
    });
    if (run.refused) {
      console.error(`  ✗ ${run.message}`);
      process.exitCode = 1;
    } else {
      if (run.message) console.warn(`  ! ${run.message}`);
      if (!run.written) {
        console.log("  (no --apply, nothing written)");
      } else {
        if (updates.length > 0) console.log(`  ✓ ${run.modified} image(s) written`);
        if (run.unchanged > 0) {
          // An image changed between the read and the write: left as it was
          console.error(`  ✗ ${run.unchanged} image(s) changed while the update ran and were left alone. Run the same file again.`);
          process.exitCode = 1;
        }
        console.log(run.logged ? "  ✓ Logged MODEL_PREDICTIONS_UPDATED to telemetry_logs" : "  Nothing to write, so no cycle was logged");
      }
    }
  }

  console.log("\n  Summary:");
  console.log(`    Model version: ${modelVersion}`);
  console.log(`    Decision threshold: ${decisionThreshold}`);
  console.log(`    Images in file: ${counts.imagesInFile}`);
  console.log(`    Images to write: ${counts.imagesUpdated}`);
  console.log(`    Proposals: ${counts.proposalsWritten}`);
  console.log(`    Skipped (already ${modelVersion}): ${counts.imagesSkippedSameVersion}`);
  console.log(`    Not served to contributors: ${counts.imagesNotServed}`);
  console.log(`    Served images not in the file: ${counts.servedImagesNotInFile}`);
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
