/**
 * Creates the indexes the app assumes but never declares.
 *
 * Two different problems are being solved here:
 *
 *   Correctness — register.js checks "is this email taken?" with a findOne and
 *   then inserts. Two simultaneous signups both pass the check and both write.
 *   Only a unique index actually prevents that, and the comment in register.js
 *   says as much.
 *
 *   Speed — every hot query (the session lookup on each annotate page load, the
 *   city match when drawing a batch, the streak aggregation) currently does a
 *   collection scan. That is survivable at study scale and not at all beyond it.
 *
 * Safe to re-run: createIndex is idempotent. A unique index that fails because
 * the collection already holds duplicates is reported, not thrown — fix the
 * duplicates, then run again.
 *
 * Usage:  node --env-file=.env scripts/ensure-indexes.mjs
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  console.error('MONGODB_URI and MONGODB_DB must be set. Try: node --env-file=.env scripts/ensure-indexes.mjs');
  process.exit(1);
}

// [collection, keys, options, why]
const INDEXES = [
  // A user row can exist before a username is chosen (a Google user who filled
  // in the profile first), so the uniqueness constraint has to skip the docs
  // where the field is absent — hence partialFilterExpression rather than a
  // plain unique index, which would treat every missing username as the same
  // null and reject the second one.
  ['users', { email: 1 }, { unique: true, name: 'uniq_email' },
    'stops two simultaneous signups from both taking the same email'],
  ['users', { username: 1 }, {
      unique: true, name: 'uniq_username',
      partialFilterExpression: { username: { $exists: true, $type: 'string' } },
    },
    'same, for usernames — skips rows that have not chosen one yet'],

  // The annotate page hits this on every load and every submit.
  ['sessions', { userId: 1, status: 1 }, { name: 'user_status' },
    'the "do I have an active session?" lookup'],

  // The upsert key in annotationSubmit. Unique makes the "one row per user per
  // image" rule structural instead of a convention.
  ['annotations', { imageID: 1, userId: 1 }, { unique: true, name: 'uniq_image_user' },
    'one annotation per user per image; this is the upsert key'],
  ['annotations', { userId: 1, status: 1 }, { name: 'user_status' },
    'the completed-count queries in annotationComplete'],
  ['annotations', { city: 1 }, { name: 'city' },
    'the public stats aggregations'],
  ['annotations', { source: 1 }, { name: 'source' },
    'filtering contributor vs annotator submissions'],

  // annotationGet matches on city, then sorts a random field.
  ['Image', { city: 1 }, { name: 'city' },
    'the city-first draw when starting a batch'],
  ['Image', { imageID: 1 }, { name: 'imageID' },
    'annotationSubmit and getAnnotation look images up by this'],
  ['Image', { poolStatus: 1, isReference: 1 }, { name: 'pool_reference' },
    'annotationGet filters served non-reference and reference images'],
  ['Image', { isReference: 1 }, { name: 'isReference' },
    'annotator mode draws only reference images'],

  // telemetry_logs grows without bound; the streak aggregation scans it.
  ['telemetry_logs', { userId: 1, event: 1, timestamp: -1 }, { name: 'user_event_time' },
    'the dashboard streak and average-time stats'],
];

const client = new MongoClient(uri);
let failures = 0;

try {
  await client.connect();
  const db = client.db(dbName);
  console.log(`Connected to ${dbName}\n`);

  for (const [coll, keys, opts, why] of INDEXES) {
    const label = `${coll}.${opts.name}`;
    try {
      await db.collection(coll).createIndex(keys, opts);
      console.log(`  ✓ ${label.padEnd(34)} ${why}`);
    } catch (err) {
      failures++;
      if (err.code === 11000 || /duplicate key/i.test(err.message)) {
        console.error(`  ✗ ${label.padEnd(34)} DUPLICATES EXIST — index not created`);
        console.error(`      Find them before retrying, e.g.:`);
        const field = Object.keys(keys)[0];
        console.error(`      db.${coll}.aggregate([{$group:{_id:"$${field}",n:{$sum:1}}},{$match:{n:{$gt:1}}}])`);
      } else if (err.codeName === 'IndexOptionsConflict' || err.code === 85 || err.code === 86) {
        console.error(`  ✗ ${label.padEnd(34)} an index with this name/shape already exists with different options`);
        console.error(`      Drop it first: db.${coll}.dropIndex("${opts.name}")`);
      } else {
        console.error(`  ✗ ${label.padEnd(34)} ${err.message}`);
      }
    }
  }

  console.log(
    failures === 0
      ? '\nAll indexes in place.'
      : `\n${failures} index(es) could not be created — see above. The app still runs; the guarantees they provide do not.`,
  );
} catch (err) {
  console.error('Could not connect:', err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}

if (failures > 0) process.exitCode = 1;
