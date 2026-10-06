/**
 * Pulls three tutorial images from the MongoDB Atlas database.
 *
 * Picks images that have model-predicted annotation boxes (annotationList with
 * at least one entry), prioritizing variety in obstruction types. Downloads the
 * image files to public/images/tutorial/ and generates src/data/tutorialImages.js
 * with the correct annotation data. Also saves the original MongoDB ObjectIds to
 * tutorial-image-ids.txt so you can exclude them from the annotation pool.
 *
 * Run once after the database is populated:
 *
 *   node --env-file=.env scripts/setup-tutorial-images.mjs
 */
import { MongoClient } from "mongodb";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  console.error(
    "MONGODB_URI and MONGODB_DB must be set. Try: node --env-file=.env scripts/setup-tutorial-images.mjs"
  );
  process.exit(1);
}

const IMAGE_DIR = join(ROOT, "public", "images", "tutorial");
const DATA_FILE = join(ROOT, "src", "data", "tutorialImages.js");
const IDS_FILE = join(ROOT, "tutorial-image-ids.txt");

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  console.log("Connected to MongoDB.");

  const db = client.db(dbName);
  const images = db.collection("Image");

  // First, check how many images exist at all to help diagnose issues
  const totalImages = await images.countDocuments();
  console.log(`Total images in collection: ${totalImages}`);

  // Find images that have model-predicted annotation boxes. Images with
  // poolStatus "served" are the ones ready for annotation. Fall back to any
  // image with an annotationList if none are served yet.
  let candidates = await images
    .find({
      poolStatus: "served",
      annotationList: { $exists: true, $ne: [], $type: "array" },
      "annotationList.0": { $exists: true },
    })
    .limit(50)
    .toArray();

  if (candidates.length < 3) {
    console.log(`Only ${candidates.length} served images with annotations. Trying without poolStatus filter...`);
    candidates = await images
      .find({
        annotationList: { $exists: true, $ne: [], $type: "array" },
        "annotationList.0": { $exists: true },
      })
      .limit(50)
      .toArray();
  }

  if (candidates.length < 3) {
    console.log(`Only ${candidates.length} images with annotationList. Trying any image with a URL...`);
    candidates = await images
      .find({ url: { $exists: true, $ne: "" } })
      .limit(50)
      .toArray();
  }

  if (candidates.length < 3) {
    console.error(
      `Only found ${candidates.length} usable images — need at least 3.`
    );
    console.error("Make sure your Image collection has images with a 'url' field.");
    await client.close();
    process.exit(1);
  }

  console.log(`Found ${candidates.length} candidate images.`);

  // Pick 3 images with the best label variety. Score each by the number of
  // distinct annotation labels it contributes.
  const seen = new Set();
  const picked = [];

  // Sort by number of distinct labels (descending) so the first picks bring
  // the most variety. Images without annotationList sort last.
  const sorted = [...candidates].sort((a, b) => {
    const aList = Array.isArray(a.annotationList) ? a.annotationList : [];
    const bList = Array.isArray(b.annotationList) ? b.annotationList : [];
    const labelsA = new Set(aList.map((box) => box.comment)).size;
    const labelsB = new Set(bList.map((box) => box.comment)).size;
    return labelsB - labelsA;
  });

  for (const img of sorted) {
    if (picked.length >= 3) break;
    const aList = Array.isArray(img.annotationList) ? img.annotationList : [];
    const labels = aList.map((box) => box.comment);
    const hasNew = labels.some((l) => !seen.has(l));
    if (hasNew || picked.length < 3) {
      picked.push(img);
      labels.forEach((l) => seen.add(l));
    }
  }

  // If we still don't have 3, just take the first 3 candidates
  while (picked.length < 3) {
    const next = candidates.find((c) => !picked.includes(c));
    if (next) picked.push(next);
    else break;
  }

  console.log(`Selected ${picked.length} images for the tutorial.`);

  // Download images
  mkdirSync(IMAGE_DIR, { recursive: true });

  const tutorialData = [];
  const mongoIds = [];

  for (let i = 0; i < picked.length; i++) {
    const img = picked[i];
    const num = i + 1;
    const filename = `tutorial-${num}.jpg`;
    const localPath = join(IMAGE_DIR, filename);

    console.log(`Downloading image ${num}: ${img.url}`);
    const response = await fetch(img.url);
    if (!response.ok) {
      console.error(`  Failed to download: ${response.status} ${response.statusText}`);
      console.error(`  URL: ${img.url}`);
      process.exit(1);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(localPath, buffer);
    console.log(`  Saved to ${localPath} (${(buffer.length / 1024).toFixed(0)} KB)`);

    mongoIds.push(img._id.toString());

    // Build tutorial entry with TUTORIAL- prefix IDs
    const tutorialId = `TUTORIAL-${String(num).padStart(3, "0")}`;
    tutorialData.push({
      _id: tutorialId,
      imageID: tutorialId,
      url: `/images/tutorial/${filename}`,
      city: img.city || "Tutorial City",
      modelVersion: img.modelVersion || "tutorial-v1",
      isReference: false,
      annotationList: (Array.isArray(img.annotationList) ? img.annotationList : []).map((box, boxIdx) => ({
        id: `tut${num}-box${boxIdx + 1}`,
        comment: box.comment || "obstruction",
        mark: {
          x: box.mark?.x ?? 0,
          y: box.mark?.y ?? 0,
          width: box.mark?.width ?? 100,
          height: box.mark?.height ?? 100,
          type: "RECT",
        },
        selected: false,
        editable: false,
        isRejected: false,
      })),
    });
  }

  // Generate src/data/tutorialImages.js
  const jsContent = `/**
 * Static tutorial images and their pre-drawn annotation boxes.
 *
 * These never change — every contributor practises on the same three images so
 * the walkthrough is predictable and reproducible. The images live in
 * public/images/tutorial/ and are served as regular static files (no database
 * round-trip, no randomness).
 *
 * Image IDs use the "TUTORIAL-" prefix so they can be trivially excluded from
 * production queries if they ever end up in the Image collection.
 *
 * Bounding-box coordinates are in the image's own pixel space, not the 960 × 600
 * canvas: the annotation tool fits the image into the canvas and maps clicks back
 * to image pixels. Each box starts as a dashed-yellow model suggestion that the
 * user must accept or reject during the walkthrough.
 *
 * Generated by: node --env-file=.env scripts/setup-tutorial-images.mjs
 * Source MongoDB IDs saved in: tutorial-image-ids.txt
 */

const TUTORIAL_IMAGES = ${JSON.stringify(tutorialData, null, 2)};

export default TUTORIAL_IMAGES;
`;

  writeFileSync(DATA_FILE, jsContent);
  console.log(`\nGenerated ${DATA_FILE}`);

  // Save MongoDB ObjectIds
  const idsContent = [
    "# Original MongoDB ObjectIds for tutorial images",
    "# Exclude these from the annotation pool if needed",
    `# Generated: ${new Date().toISOString()}`,
    "",
    ...mongoIds.map((id, i) => `tutorial-${i + 1}: ${id}`),
    "",
  ].join("\n");

  writeFileSync(IDS_FILE, idsContent);
  console.log(`Saved original MongoDB IDs to ${IDS_FILE}`);

  await client.close();
  console.log("\nDone! Tutorial images are ready.");
  console.log("Run `yarn test` to verify the data shape passes all tests.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
