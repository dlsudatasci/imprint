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
 * Options:
 *   --input <file>     Path to the predictions JSON (required)
 *   --dry-run          Check and report without writing
 *   --force            Write images already at this modelVersion too
 *   --allow-partial    Allow served images to be missing from the file (to
 *                      finish a run that was split on purpose)
 *
 * Usage:
 *   node --env-file=.env scripts/update-predictions.mjs --input predictions.json --dry-run
 *   node --env-file=.env scripts/update-predictions.mjs --input predictions.json
 */
import { MongoClient } from "mongodb";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import {
  SERVED_POOL_STATUS,
  validatePredictionFile,
  planPredictionUpdate,
  updateOperation,
} from "../src/util/validators/predictionUpdate.mjs";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
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
  } else if (values["dry-run"]) {
    console.log("  (dry run, nothing written)");
  } else {
    const now = new Date();
    let modified = 0;
    if (updates.length > 0) {
      const result = await imageColl.bulkWrite(updates.map((u) => updateOperation(u, modelVersion, now)), { ordered: false });
      modified = result.modifiedCount;
      console.log(`  ✓ ${modified} image(s) written`);
      if (result.matchedCount < updates.length) {
        // An image changed between the read and the write: left as it was
        console.error(`  ✗ ${updates.length - result.matchedCount} image(s) changed while the update ran and were left alone. Run the same file again.`);
        process.exitCode = 1;
      }
    }

    // A run that wrote nothing (every image already at this version) is not a cycle
    if (modified > 0) await db.collection("telemetry_logs").insertOne({
      event: "MODEL_PREDICTIONS_UPDATED",
      modelVersion,
      decisionThreshold,
      predictionsInFile: counts.imagesInFile,
      imagesUpdated: modified,
      imagesSkippedSameVersion: counts.imagesSkippedSameVersion,
      proposalsWritten: counts.proposalsWritten,
      servedImagesNotInFile: counts.servedImagesNotInFile,
      partial: values["allow-partial"],
      timestamp: now,
    });
    console.log(modified > 0 ? "  ✓ Logged MODEL_PREDICTIONS_UPDATED to telemetry_logs" : "  Nothing to write, so no cycle was logged");
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
