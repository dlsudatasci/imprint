/**
 * Moves reserve images into the served pool.
 *
 * Reserve images sit in `poolStatus: "reserve"` until the active pool runs
 * low. This script promotes them to "served" so annotationGet starts handing
 * them out.
 *
 * Options:
 *   --city <slug>    Only promote reserves for this city
 *   --count <n>      Promote at most this many (default: all reserves)
 *   --dry-run        Print what would change without writing
 *
 * Usage:  node --env-file=.env scripts/promote-reserve.mjs [--city makati] [--count 50] [--dry-run]
 */
import { MongoClient } from "mongodb";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    city:    { type: "string" },
    count:   { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  console.error("MONGODB_URI and MONGODB_DB must be set. Try: node --env-file=.env scripts/promote-reserve.mjs");
  process.exit(1);
}

const filter = { poolStatus: "reserve" };
if (values.city) filter.city = values.city;

const limit = values.count ? Number(values.count) : null;
if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
  console.error("--count must be a positive integer");
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  const coll = db.collection("Image");
  console.log(`Connected to ${dbName}\n`);

  if (limit) {
    const ids = await coll
      .find(filter, { projection: { _id: 1 } })
      .limit(limit)
      .toArray();

    console.log(`  Found ${ids.length} reserve image(s) to promote`);

    if (values["dry-run"]) {
      console.log("  (dry run — no changes written)");
    } else {
      const result = await coll.updateMany(
        { _id: { $in: ids.map((d) => d._id) } },
        { $set: { poolStatus: "served" } }
      );
      console.log(`  ✓ Promoted ${result.modifiedCount} image(s) to "served"`);
    }
  } else {
    const count = await coll.countDocuments(filter);
    console.log(`  Found ${count} reserve image(s) to promote`);

    if (values["dry-run"]) {
      console.log("  (dry run — no changes written)");
    } else {
      const result = await coll.updateMany(filter, { $set: { poolStatus: "served" } });
      console.log(`  ✓ Promoted ${result.modifiedCount} image(s) to "served"`);
    }
  }
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
