/**
 * Flags 150 images as reference images for inter-rater agreement measurement.
 *
 * Reference images are served to annotators (trained raters) to produce
 * ground-truth labels. They are also mixed into contributor sessions (~1 in 8)
 * so contributor reliability can be estimated without their knowledge.
 *
 * Selection: takes 150 random images from the served pool, spread across all
 * available cities so no city is over-represented in the reference set.
 *
 * Safe to re-run: clears previous reference flags first, then picks a fresh
 * set. Existing referenceGroundTruth is NOT cleared — only the flag moves.
 *
 * Usage:  node --env-file=.env scripts/flag-reference-images.mjs [--count 150]
 */
import { MongoClient } from "mongodb";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    count: { type: "string", default: "150" },
  },
});

const TARGET = Number(values.count);
if (!Number.isInteger(TARGET) || TARGET < 1) {
  console.error("--count must be a positive integer");
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  console.error("MONGODB_URI and MONGODB_DB must be set. Try: node --env-file=.env scripts/flag-reference-images.mjs");
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  const coll = db.collection("Image");
  console.log(`Connected to ${dbName}\n`);

  // Clear previous reference flags
  const cleared = await coll.updateMany(
    { isReference: true },
    { $set: { isReference: false } }
  );
  if (cleared.modifiedCount > 0) {
    console.log(`  Cleared ${cleared.modifiedCount} previous reference flag(s)`);
  }

  // Distribute across cities. Get the distinct cities, then take
  // ceil(TARGET / numCities) from each, shuffled, until we hit TARGET.
  const cities = await coll.distinct("city", { poolStatus: "served" });

  if (cities.length === 0) {
    console.error("  No served images found. Run migrate-image-schema.mjs first.");
    process.exit(1);
  }

  const perCity = Math.ceil(TARGET / cities.length);
  const selectedIDs = [];

  for (const city of cities) {
    if (selectedIDs.length >= TARGET) break;

    const needed = TARGET - selectedIDs.length;
    const take = Math.min(perCity, needed);

    const batch = await coll
      .aggregate([
        { $match: { city, poolStatus: "served" } },
        { $addFields: { rand: { $rand: {} } } },
        { $sort: { rand: 1 } },
        { $limit: take },
        { $project: { _id: 1 } },
      ])
      .toArray();

    selectedIDs.push(...batch.map((d) => d._id));
  }

  if (selectedIDs.length === 0) {
    console.error("  No images matched. Check your Image collection.");
    process.exit(1);
  }

  const flagged = await coll.updateMany(
    { _id: { $in: selectedIDs } },
    { $set: { isReference: true } }
  );

  console.log(`  ✓ Flagged ${flagged.modifiedCount} image(s) as reference (target was ${TARGET})`);
  console.log(`    Spread across ${cities.length} city/cities`);
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
