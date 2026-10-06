/**
 * Updates Image documents with new model predictions after a retraining cycle.
 *
 * Reads a JSON file produced by the offline ML pipeline (XGBoost classifier)
 * and writes the new bounding-box predictions into each Image's annotationList,
 * updating modelVersion so new sessions serve the retrained suggestions.
 *
 * Input file format:
 *   {
 *     "modelVersion": "v1-retrained",
 *     "predictions": [
 *       {
 *         "imageID": 12345,
 *         "boxes": [
 *           { "x": 10, "y": 20, "width": 50, "height": 60, "category": "tree", "confidence": 0.92 }
 *         ]
 *       }
 *     ]
 *   }
 *
 * Options:
 *   --input <file>   Path to predictions JSON (required)
 *   --dry-run        Validate and report without writing to the database
 *   --force          Overwrite even if images already have the same modelVersion
 *
 * Usage:
 *   node --env-file=.env scripts/update-predictions.mjs --input predictions.json
 *   node --env-file=.env scripts/update-predictions.mjs --input predictions.json --dry-run
 */
import { MongoClient } from "mongodb";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";

const { values } = parseArgs({
  options: {
    input:     { type: "string" },
    "dry-run": { type: "boolean", default: false },
    force:     { type: "boolean", default: false },
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

const VERSION_PATTERN = /^v\d+-\w[\w-]*$/;

const TAXONOMY_CATEGORIES = new Set([
  "bench", "bicycle", "bollard", "car", "construction_materials",
  "electrical_box", "fire_hydrant", "garbage", "lamp_post",
  "motorcycle", "movable_signage", "potted_plant", "street_sign",
  "street_vendor_cart", "trash_bin", "tree", "tricycle", "utility_post",
]);

function validateBox(box, index) {
  if (!box || typeof box !== "object") return `Box ${index}: not an object`;
  const { x, y, width, height, category, confidence } = box;
  if (typeof x !== "number" || typeof y !== "number" ||
      typeof width !== "number" || typeof height !== "number") return `Box ${index}: non-numeric geometry`;
  if (width <= 0 || height <= 0) return `Box ${index}: non-positive dimensions`;
  if (typeof category !== "string" || !category) return `Box ${index}: missing category`;
  if (!TAXONOMY_CATEGORIES.has(category)) return `Box ${index}: unknown category "${category}"`;
  if (confidence !== undefined && confidence !== null) {
    if (typeof confidence !== "number" || confidence < 0 || confidence > 1) return `Box ${index}: confidence outside [0, 1]`;
  }
  return null;
}

let raw;
try {
  raw = await readFile(values.input, "utf-8");
} catch (err) {
  console.error(`Cannot read input file: ${err.message}`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  console.error(`Invalid JSON: ${err.message}`);
  process.exit(1);
}

const { modelVersion, predictions } = data;

if (!modelVersion || typeof modelVersion !== "string" || !VERSION_PATTERN.test(modelVersion)) {
  console.error(`Invalid modelVersion "${modelVersion}". Expected format: v<number>-<name>`);
  process.exit(1);
}

if (!Array.isArray(predictions) || predictions.length === 0) {
  console.error("predictions must be a non-empty array");
  process.exit(1);
}

const seenIDs = new Set();
for (let i = 0; i < predictions.length; i++) {
  const entry = predictions[i];
  if (!entry || typeof entry !== "object") {
    console.error(`Entry ${i}: not an object`);
    process.exit(1);
  }
  if (entry.imageID === undefined || entry.imageID === null) {
    console.error(`Entry ${i}: missing imageID`);
    process.exit(1);
  }
  if (seenIDs.has(entry.imageID)) {
    console.error(`Entry ${i}: duplicate imageID ${entry.imageID}`);
    process.exit(1);
  }
  seenIDs.add(entry.imageID);

  if (!Array.isArray(entry.boxes)) {
    console.error(`Entry ${i} (imageID=${entry.imageID}): boxes is not an array`);
    process.exit(1);
  }
  for (let j = 0; j < entry.boxes.length; j++) {
    const err = validateBox(entry.boxes[j], j);
    if (err) {
      console.error(`Entry ${i} (imageID=${entry.imageID}): ${err}`);
      process.exit(1);
    }
  }
}

console.log(`Validated ${predictions.length} predictions for model ${modelVersion}`);

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  const imageColl = db.collection("Image");
  console.log(`Connected to ${dbName}\n`);

  const imageIDs = predictions.map((p) => p.imageID);
  const existing = await imageColl.find(
    { imageID: { $in: imageIDs } },
    { projection: { imageID: 1, modelVersion: 1 } }
  ).toArray();
  const existingMap = new Map(existing.map((img) => [img.imageID, img]));

  const missing = imageIDs.filter((id) => !existingMap.has(id));
  if (missing.length > 0) {
    console.warn(`  ⚠ ${missing.length} imageID(s) not found in Image collection (will be skipped):`);
    if (missing.length <= 10) console.warn(`    ${missing.join(", ")}`);
    else console.warn(`    ${missing.slice(0, 10).join(", ")} ... and ${missing.length - 10} more`);
  }

  let skippedSameVersion = 0;
  let updatedCount = 0;
  let clearedCount = 0;

  if (values["dry-run"]) {
    for (const pred of predictions) {
      if (!existingMap.has(pred.imageID)) continue;
      const img = existingMap.get(pred.imageID);
      if (!values.force && img.modelVersion === modelVersion) {
        skippedSameVersion++;
        continue;
      }
      if (pred.boxes.length === 0) clearedCount++;
      else updatedCount++;
    }
    console.log("  (dry run — no changes written)");
  } else {
    const ops = [];
    for (const pred of predictions) {
      if (!existingMap.has(pred.imageID)) continue;
      const img = existingMap.get(pred.imageID);
      if (!values.force && img.modelVersion === modelVersion) {
        skippedSameVersion++;
        continue;
      }

      const annotationList = pred.boxes.map((box, i) => ({
        id: `pred-${i}`,
        comment: box.category,
        mark: { x: box.x, y: box.y, width: box.width, height: box.height },
        editable: false,
        selected: false,
        confidence: box.confidence ?? null,
      }));

      ops.push({
        updateOne: {
          filter: { imageID: pred.imageID },
          update: {
            $set: {
              annotationList,
              modelVersion,
              predictionUpdatedAt: new Date(),
            },
          },
        },
      });

      if (pred.boxes.length === 0) clearedCount++;
      else updatedCount++;
    }

    if (ops.length > 0) {
      const result = await imageColl.bulkWrite(ops, { ordered: false });
      console.log(`  ✓ Bulk write: ${result.modifiedCount} image(s) modified`);
    }

    await db.collection("telemetry_logs").insertOne({
      event: "MODEL_PREDICTIONS_UPDATED",
      modelVersion,
      predictionsInFile: predictions.length,
      imagesUpdated: updatedCount,
      imagesCleared: clearedCount,
      imagesMissing: missing.length,
      imagesSkippedSameVersion: skippedSameVersion,
      timestamp: new Date(),
    });
    console.log("  ✓ Logged MODEL_PREDICTIONS_UPDATED to telemetry_logs");
  }

  console.log(`\n  Summary:`);
  console.log(`    Model version: ${modelVersion}`);
  console.log(`    Predictions in file: ${predictions.length}`);
  console.log(`    Images updated: ${updatedCount}`);
  console.log(`    Images cleared (0 boxes): ${clearedCount}`);
  console.log(`    Images not found: ${missing.length}`);
  console.log(`    Skipped (already ${modelVersion}): ${skippedSameVersion}`);
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
