/**
 * Exports annotation data in formats for retraining, research, and quality analysis.
 *
 * Modes:
 *   --retraining   Obstruction judgments with demographic features, excluding
 *                  custom categories, reference-image annotations and boxes
 *                  smaller than about 20 by 20 pixels (under 400 square pixels in
 *                  the 640 by 640 model copy, 6 Oct 2026). One row per judgment
 *                  in the per-judgment format the classifier expects.
 *   --full         All collections as JSON files, pseudonymized (no emails/passwords).
 *   --quality      Paired reference/contributor annotations for agreement computation.
 *   --masks        Annotators' sidewalk outlines (polygons), one JSON object per
 *                  line. sidewalk-masks.jsonl holds the model-development
 *                  outlines, for training and evaluation. The pixel masks are
 *                  drawn from them outside IMPRINT. sidewalk-masks-agreement.jsonl
 *                  (always written, empty when there are none) holds the outlines
 *                  on the 30 reference images flagged sidewalkAgreement: true, for
 *                  agreement between annotators only, never for training.
 *   --output <dir> Output directory (default: ./exports/)
 *
 * Annotator rows (source "annotator") have sceneLevel: null and severity: null
 * on every box from 3 Oct 2026. From 4 Oct 2026 annotators do Objects, then
 * Obstructions, so every real box (kept or drawn) carries obstructs true or
 * false and Not an object boxes carry obstructs: null. --retraining skips any
 * box with no Yes/No. From 6 Oct 2026 annotator rows on model-development
 * images also carry sidewalkMask ({ noSidewalk, polygons }), null on reference
 * images. Contributor rows have no sidewalkMask.
 *
 * Usage:
 *   node --env-file=.env scripts/export-data.mjs --retraining
 *   node --env-file=.env scripts/export-data.mjs --full --output ./my-exports
 *   node --env-file=.env scripts/export-data.mjs --quality
 *   node --env-file=.env scripts/export-data.mjs --masks
 */
import { MongoClient } from "mongodb";
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  RETRAINING_CSV_KEYS, RETRAINING_TAXONOMY,
  buildRetrainingRows, pseudonymize, toCsvRow, writeCsv,
} from "../src/util/validators/retrainingExport.mjs";
import { buildSidewalkMaskRows, toJsonl } from "../src/util/validators/sidewalkMaskExport.mjs";

const { values } = parseArgs({
  options: {
    retraining: { type: "boolean", default: false },
    full:       { type: "boolean", default: false },
    quality:    { type: "boolean", default: false },
    masks:      { type: "boolean", default: false },
    output:     { type: "string", default: "./exports" },
  },
});

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  console.error("MONGODB_URI and MONGODB_DB must be set. Try: node --env-file=.env scripts/export-data.mjs --retraining");
  process.exit(1);
}

if (!values.retraining && !values.full && !values.quality && !values.masks) {
  console.error("Specify at least one mode: --retraining, --full, --quality, or --masks");
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  const outDir = values.output;
  await mkdir(outDir, { recursive: true });
  console.log(`Connected to ${dbName}`);
  console.log(`Output directory: ${outDir}\n`);

  // Build user lookup (needed by retraining and quality modes)
  async function buildUserMap() {
    const users = await db.collection("users").find(
      {},
      {
        projection: {
          _id: 1, age: 1, gender: 1, disability: 1, commuteFrequency: 1,
          educationalAttainment: 1, walkingFrequency: 1,
          accessibilityFamiliarity: 1, priorAnnotationExperience: 1,
          occupation: 1, frequentlyWalkedCities: 1, temporaryMobility: 1,
        },
      }
    ).toArray();
    const map = new Map();
    for (const u of users) {
      map.set(String(u._id), u);
    }
    return map;
  }

  // Build image lookup
  async function buildImageMap() {
    const images = await db.collection("Image").find(
      {},
      { projection: { _id: 1, imageID: 1, isReference: 1, city: 1, width: 1, height: 1 } }
    ).toArray();
    const map = new Map();
    for (const img of images) {
      map.set(img.imageID, img);
    }
    return map;
  }

  // --- RETRAINING MODE ---
  if (values.retraining) {
    console.log("=== Retraining Feed ===");
    const userMap = await buildUserMap();
    const imageMap = await buildImageMap();

    const annotations = await db.collection("annotations").find(
      { status: "completed" }
    ).toArray();

    const { rows, summary } = buildRetrainingRows({ annotations, userMap, imageMap });

    const csv = writeCsv(rows, RETRAINING_CSV_KEYS);
    const outPath = join(outDir, "retraining-feed.csv");
    await writeFile(outPath, csv);

    const createdPct = summary.rows > 0
      ? ((summary.createdBoxRows / summary.rows) * 100).toFixed(1)
      : "0.0";
    console.log(`  ✓ ${summary.rows} judgments → ${outPath}`);
    console.log(`    Created-box rows: ${summary.createdBoxRows} (${createdPct}%)`);
    console.log(`    Fallback rows (no initialState): ${summary.fallbackRows}`);
    console.log(`    Excluded: ${summary.excludedReferenceAnnotations} reference annotations, ${summary.excludedNotAnObject} not-an-object, ${summary.excludedFreeText} free-text, ${summary.excludedNonTaxonomyFeatureCategory} non-taxonomy feature category, ${summary.excludedNoJudgment} with no obstruction answer, ${summary.excludedBelowMinimumSize} smaller than about 20 by 20 pixels`);
  }

  // --- FULL EXPORT MODE ---
  if (values.full) {
    console.log("=== Full Research Export ===");

    const collections = [
      "users", "Image", "sessions", "annotations",
      "telemetry_logs", "nasa_tlx", "exit_surveys",
    ];

    for (const collName of collections) {
      const docs = await db.collection(collName).find({}).toArray();

      const sanitized = docs.map((doc) => {
        const out = { ...doc };
        out._id = String(out._id);

        if (collName === "users") {
          out.pseudoId = pseudonymize(out._id);
          delete out.password;
          delete out.email;
          delete out.resetToken;
          delete out.resetTokenExpiry;
          delete out.googleId;
        }

        if (out.userId) {
          out.pseudoUserId = pseudonymize(out.userId);
        }

        return out;
      });

      const outPath = join(outDir, `${collName}.json`);
      await writeFile(outPath, JSON.stringify(sanitized, null, 2));
      console.log(`  ✓ ${collName}: ${docs.length} documents → ${outPath}`);
    }
  }

  // --- QUALITY EXPORT MODE ---
  if (values.quality) {
    console.log("=== Quality Metrics Export ===");
    const imageMap = await buildImageMap();

    // Find reference images
    const refImageIDs = [];
    for (const [imageID, img] of imageMap) {
      if (img.isReference) refImageIDs.push(imageID);
    }

    // Get all annotations on reference images
    const refAnnotations = await db.collection("annotations").find(
      { imageID: { $in: refImageIDs }, status: "completed" }
    ).toArray();

    // Get ground truth from Image documents
    const refImages = await db.collection("Image").find(
      { isReference: true },
      { projection: { imageID: 1, referenceGroundTruth: 1, city: 1 } }
    ).toArray();

    const groundTruthMap = new Map();
    for (const img of refImages) {
      groundTruthMap.set(img.imageID, img.referenceGroundTruth || null);
    }

    const pairs = refAnnotations.map((ann) => {
      const allBoxes = [
        ...(ann.selectedObjectsID || []),
        ...(ann.newObjects || []),
      ];
      const notAnObjectCount = allBoxes.filter((box) => box.comment === "not_an_object").length;
      const realBoxes = allBoxes.filter((box) => box.comment !== "not_an_object");
      return {
        imageID: ann.imageID,
        city: imageMap.get(ann.imageID)?.city ?? "",
        pseudoUserId: pseudonymize(ann.userId),
        source: ann.source || "contributor",
        groundTruth: groundTruthMap.get(ann.imageID),
        contributorBoxes: realBoxes.map((box) => ({
          category: box.comment || box.label || "",
          obstructs: box.obstructs ?? null,
          severity: box.severity ?? null,
          x: box.mark?.x ?? null,
          y: box.mark?.y ?? null,
          w: box.mark?.width ?? null,
          h: box.mark?.height ?? null,
        })),
        notAnObjectCount,
        sceneLevel: ann.sceneLevel || null,
      };
    });

    const outPath = join(outDir, "quality-pairs.json");
    await writeFile(outPath, JSON.stringify(pairs, null, 2));
    console.log(`  ✓ ${pairs.length} reference annotations from ${refImageIDs.length} reference images → ${outPath}`);
  }

  // --- SIDEWALK MASKS MODE ---
  if (values.masks) {
    console.log("=== Sidewalk Outlines ===");
    const annotations = await db.collection("annotations").find(
      { source: "annotator", status: "completed", sidewalkMask: { $ne: null } }
    ).toArray();
    const imageIDs = [...new Set(annotations.map((ann) => ann.imageID))];
    const images = await db.collection("Image").find(
      { imageID: { $in: imageIDs } },
      { projection: { imageID: 1, imageName: 1, city: 1, width: 1, height: 1, letterbox: 1, isReference: 1, sidewalkAgreement: 1 } }
    ).toArray();
    const imageMap = new Map(images.map((img) => [img.imageID, img]));

    const { rows, agreementRows, summary } = buildSidewalkMaskRows({ annotations, imageMap });
    const outPath = join(outDir, "sidewalk-masks.jsonl");
    await writeFile(outPath, toJsonl(rows));
    console.log(`  ✓ ${summary.rows} outlines (${summary.noSidewalkRows} with no sidewalk) → ${outPath}`);
    const agreementPath = join(outDir, "sidewalk-masks-agreement.jsonl");
    await writeFile(agreementPath, toJsonl(agreementRows));
    console.log(`  ✓ ${summary.agreementRows} agreement outlines on flagged reference images (${summary.agreementNoSidewalkRows} with no sidewalk) → ${agreementPath}`);
    console.log(`    Excluded: ${summary.excludedReference} on unflagged reference images, ${summary.excludedMissingImage} with no Image record`);
  }

  console.log("\nDone.");
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
