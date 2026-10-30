/**
 * Writes the frozen detector's boxes into every image a contributor can be
 * served (S1, 30 Oct 2026), once, before the first contributor. Run it
 * before set-tau.mjs.
 *
 * For every served and reserve image it keeps the current annotationList (the
 * Step 3 suggestions annotators were shown on reference images) in
 * step3AnnotationList, writes the detector's boxes as the new annotationList,
 * and sets modelVersion (v0-..., since no classifier proposal exists yet),
 * detectorVersion, segmenterVersion and detectorBoxesWrittenAt.
 *
 * The input file and every check are described in
 * src/util/validators/detectorBoxes.mjs. In short: every image in the file
 * must exist, be served or reserve (never model_dev) and have the file's
 * size, every served and reserve image must be in the file, no contributor
 * may have answered it, and nothing else may have written
 * step3AnnotationList. If anything fails, nothing is written. An image
 * already at the file's detectorVersion is skipped, so a second run changes
 * nothing.
 *
 * It never writes while any session is active, like update-predictions.mjs
 * (S5): an open session holds the old suggestion ids, so its answers would be
 * refused, and its stored answers would carry a model version it was not
 * shown. With --apply it counts the sessions whose status is "active" just
 * before writing, and if there are any it prints only their number, writes
 * nothing and exits with code 1. There is no option to override it. Without
 * --apply the same count is printed as a warning.
 *
 * Without --apply it only checks and reports, and writes nothing. It prints
 * counts and image ids only, never a username.
 *
 * Options:
 *   --input <file>     Path to the detector boxes JSON (required)
 *   --apply            Write the boxes (refused while any session is active)
 *   --skip-answered    Leave images a contributor has answered as they are
 *                      and count them (staging after the pilot only, never
 *                      production)
 *
 * Usage:
 *   node --env-file=.env scripts/write-detector-boxes.mjs --input s1_detector_boxes.json
 *   node --env-file=.env scripts/write-detector-boxes.mjs --input s1_detector_boxes.json --apply
 */
import { MongoClient } from "mongodb";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import {
  validateDetectorBoxesFile,
  readDetectorBoxesState,
  planDetectorBoxes,
  runDetectorBoxes,
  tauReminder,
} from "../src/util/validators/detectorBoxes.mjs";
import { readTauSetting } from "../src/util/validators/tauSetting.mjs";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    apply: { type: "boolean", default: false },
    "skip-answered": { type: "boolean", default: false },
  },
});

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  console.error("MONGODB_URI and MONGODB_DB must be set. Try: node --env-file=.env scripts/write-detector-boxes.mjs --input s1_detector_boxes.json");
  process.exit(1);
}

if (!values.input) {
  console.error("--input <file> is required. Point it at the JSON file from scripts/phase6_s1_file.py.");
  process.exit(1);
}

let data;
try {
  data = JSON.parse(await readFile(values.input, "utf-8"));
} catch (err) {
  console.error(`Cannot read ${values.input}: ${err.message}`);
  process.exit(1);
}

function printProblems(problems, what) {
  console.error(`${what} ${problems.length} problem(s). Nothing was written.`);
  for (const p of problems.slice(0, 30)) console.error(`  - ${p}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
}

const fileProblems = validateDetectorBoxesFile(data);
if (fileProblems.length > 0) {
  printProblems(fileProblems, "The file has");
  process.exit(1);
}

console.log(`File checked: ${data.images.length} image(s) from ${data.detectorVersion}, model version ${data.modelVersion}, tau ${data.tau}, storage floor ${data.storageFloor}`);

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  console.log(`Connected to ${dbName}\n`);

  const { images, answeredImageIDs } = await readDetectorBoxesState(db, data);
  const { problems, updates, counts } = planDetectorBoxes(data, images, answeredImageIDs, {
    skipAnswered: values["skip-answered"],
  });
  let activeSessions = null;

  if (problems.length > 0) {
    printProblems(problems, "Found");
    process.exitCode = 1;
  } else {
    // The active sessions are counted just before writing, and any refuses it
    const run = await runDetectorBoxes(db, { data, updates, counts }, { apply: values.apply });
    activeSessions = run.activeSessions;
    if (run.refused) {
      console.error(`  ✗ ${run.message}`);
      process.exitCode = 1;
    } else {
      if (run.message) console.warn(`  ! ${run.message}`);
      if (!run.written) {
        console.log("  (no --apply, nothing written)");
      } else {
        if (updates.length > 0) console.log(`  ✓ ${run.modified} image(s) written, ${run.suggestionsWritten} suggestion(s)`);
        if (run.unchanged > 0) {
          // An image changed between the read and the write: left as it was
          console.error(`  ✗ ${run.unchanged} image(s) changed while the write ran and were left alone. Run the same file again.`);
          process.exitCode = 1;
        }
        console.log(run.logged ? "  ✓ Logged DETECTOR_BOXES_WRITTEN to telemetry_logs" : "  Nothing to write, so nothing was logged");
      }
    }
  }

  const tau = tauReminder(await readTauSetting(db), data);

  console.log("\n  Summary:");
  console.log(`    Detector: ${data.detectorVersion}, segmenter: ${data.segmenterVersion}`);
  console.log(`    Model version to write: ${data.modelVersion}`);
  console.log(`    Images in file: ${counts.imagesInFile}`);
  for (const [pool, n] of Object.entries(counts.imagesInFileByPoolStatus)) console.log(`      ${pool}: ${n}`);
  console.log("    Current model versions:");
  for (const [version, n] of Object.entries(counts.currentModelVersions)) console.log(`      ${version}: ${n}`);
  console.log(`    Images to write: ${counts.imagesToWrite}`);
  console.log(`    Suggestions to write: ${counts.suggestionsToWrite}`);
  console.log(`    Suggestions at or above the file's tau (${data.tau}): ${counts.suggestionsAtOrAboveTau}`);
  console.log(`    Skipped (already ${data.detectorVersion}): ${counts.imagesSkippedAlreadyWritten}`);
  console.log(`    Skipped (answered by a contributor): ${counts.imagesSkippedAnswered}`);
  console.log(`    Served or reserve images not in the file: ${counts.poolImagesNotInFile}`);
  console.log(`    Active sessions: ${activeSessions ?? "not counted"}`);
  console.log(`    Tau setting: ${tau.value}${tau.isDefault ? " (default)" : ` for ${tau.modelVersion ?? "no model version"}`}`);
  if (tau.message) console.log(`\n  ! ${tau.message}`);
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
