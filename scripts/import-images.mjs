/**
 * Imports the Step 3 image records into the `Image` collection.
 *
 * Reads image_records.json (thesis scripts/mapillary/data/step3/), validates
 * every record (src/util/validators/imageImport.mjs), sets each `url` to
 * <url-prefix><imageName>, and inserts them. Every image arrives with
 * poolStatus "unserved", so nothing is served until corpus assignment (Step 5).
 *
 * Refuses to write into an Image collection that already holds documents, so
 * it can never mix the new corpus with old records or run twice by accident.
 *
 * Options:
 *   --file <path>        image_records.json (required)
 *   --url-prefix <path>  default "/corpus-images/" (nginx serves this path)
 *   --expect <n>         refuse unless the file holds exactly n records
 *   --dry-run            validate and report, write nothing
 *
 * Usage:
 *   MONGODB_URI=... MONGODB_DB=imprint node scripts/import-images.mjs --file <path> --expect 2687 --dry-run
 */
import { MongoClient } from "mongodb";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateImageRecords, prepareImageDocs } from "../src/util/validators/imageImport.mjs";

const { values } = parseArgs({
  options: {
    file: { type: "string" },
    "url-prefix": { type: "string", default: "/corpus-images/" },
    expect: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

if (!values.file) {
  console.error("--file <path to image_records.json> is required");
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;
if (!uri || !dbName) {
  console.error("MONGODB_URI and MONGODB_DB must be set.");
  process.exit(1);
}

const raw = await readFile(values.file);
const sha256 = createHash("sha256").update(raw).digest("hex");
let records;
try {
  records = JSON.parse(raw.toString("utf-8"));
} catch (err) {
  console.error(`Invalid JSON: ${err.message}`);
  process.exit(1);
}

if (values.expect !== undefined && records.length !== Number(values.expect)) {
  console.error(`Expected ${values.expect} records, file holds ${records.length}. Nothing written.`);
  process.exit(1);
}

const { problems, counts } = validateImageRecords(records);
if (problems.length > 0) {
  console.error(`${problems.length} problem(s) in ${values.file}. Nothing written. First 20:`);
  for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
  process.exit(1);
}

let docs;
try {
  docs = prepareImageDocs(records, values["url-prefix"]);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

console.log(`File:    ${values.file}`);
console.log(`SHA-256: ${sha256}`);
console.log(`Records: ${counts.total} (boxes: ${counts.boxes})`);
console.log(`Sources: ${JSON.stringify(counts.bySource)}`);
console.log(`Cities:  ${JSON.stringify(counts.byCity)}`);
console.log(`URL:     ${docs[0].url}  (first record)`);
console.log(`Target:  database "${dbName}", collection "Image"`);

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);
  const coll = db.collection("Image");

  const existing = await coll.countDocuments();
  if (existing > 0) {
    console.error(`\nThe Image collection already holds ${existing} document(s). Nothing written.`);
    console.error("This script only imports into an empty collection.");
    process.exitCode = 1;
  } else if (values["dry-run"]) {
    console.log("\nValidation passed and the collection is empty. Dry run: nothing written.");
  } else {
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < docs.length; i += BATCH) {
      const res = await coll.insertMany(docs.slice(i, i + BATCH), { ordered: true });
      inserted += res.insertedCount;
    }
    const after = await coll.countDocuments();
    await db.collection("telemetry_logs").insertOne({
      event: "IMAGES_IMPORTED",
      count: inserted,
      sourceFile: values.file.split("/").pop(),
      sourceSha256: sha256,
      urlPrefix: values["url-prefix"],
      timestamp: new Date(),
    });
    console.log(`\nInserted ${inserted}. Image collection now holds ${after}.`);
    if (after !== docs.length) {
      console.error("Count after insert does not match the file. Check before continuing.");
      process.exitCode = 1;
    }
  }
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
