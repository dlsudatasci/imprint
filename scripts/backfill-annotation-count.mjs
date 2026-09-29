/**
 * Backfills the `annotationCount` field on every Image document.
 *
 * For each image, counts the number of completed annotations that reference it
 * and writes the total to `Image.annotationCount`. Safe to re-run: it
 * overwrites whatever value is already there with the authoritative count.
 *
 * Usage:  node --env-file=.env scripts/backfill-annotation-count.mjs
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  console.error('MONGODB_URI and MONGODB_DB must be set. Try: node --env-file=.env scripts/backfill-annotation-count.mjs');
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  console.log(`Connected to ${dbName}\n`);

  const counts = await db.collection('annotations').aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: '$imageID', count: { $sum: 1 } } },
  ]).toArray();

  console.log(`Found annotation counts for ${counts.length} images.`);

  if (counts.length > 0) {
    const ops = counts.map(({ _id: imageID, count }) => ({
      updateOne: {
        filter: { imageID },
        update: { $set: { annotationCount: count } },
      },
    }));

    const result = await db.collection('Image').bulkWrite(ops);
    console.log(`Updated ${result.modifiedCount} Image documents.`);
  }

  const remaining = await db.collection('Image').countDocuments({
    annotationCount: { $exists: false },
  });

  if (remaining > 0) {
    await db.collection('Image').updateMany(
      { annotationCount: { $exists: false } },
      { $set: { annotationCount: 0 } }
    );
    console.log(`Set annotationCount to 0 on ${remaining} images with no annotations.`);
  }

  console.log('\nBackfill complete.');
} catch (err) {
  console.error('Error:', err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
