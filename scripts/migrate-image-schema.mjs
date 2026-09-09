/**
 * Adds the reference-image and pool-status fields to every Image record.
 *
 * New fields:
 *   isReference         Boolean  — true for the ~150 images used to measure
 *                                  inter-rater agreement. Default false.
 *   poolStatus          String   — "model_dev" | "served" | "reserve".
 *                                  Default "served" (available to contributors).
 *   referenceGroundTruth Array   — annotator judgments appended after each
 *                                  completion. Starts empty.
 *   predictions          Object  — stub for the model pipeline. Starts null.
 *
 * Safe to re-run: uses $set with $exists guards so it never overwrites data
 * that a later script (flag-reference-images, promote-reserve) already wrote.
 *
 * Usage:  node --env-file=.env scripts/migrate-image-schema.mjs
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  console.error("MONGODB_URI and MONGODB_DB must be set. Try: node --env-file=.env scripts/migrate-image-schema.mjs");
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  console.log(`Connected to ${dbName}\n`);

  const result = await db.collection("Image").updateMany(
    {
      $or: [
        { isReference: { $exists: false } },
        { poolStatus: { $exists: false } },
        { referenceGroundTruth: { $exists: false } },
        { predictions: { $exists: false } },
      ],
    },
    [
      {
        $set: {
          isReference: { $ifNull: ["$isReference", false] },
          poolStatus: { $ifNull: ["$poolStatus", "served"] },
          referenceGroundTruth: { $ifNull: ["$referenceGroundTruth", []] },
          predictions: { $ifNull: ["$predictions", null] },
        },
      },
    ]
  );

  console.log(`  ✓ ${result.modifiedCount} image(s) updated (${result.matchedCount} matched)`);
  console.log("\nMigration complete.");
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
