/**
 * Validation and preparation of the Step 3 image records before they are
 * imported into the `Image` collection (scripts/import-images.mjs).
 *
 * `.mjs` with no `@/` imports, because scripts/import-images.mjs imports it
 * directly with Node and package.json has no "type": "module". Tests import it
 * normally and check the constants below against src/util.
 */

// normalizeCityName() output for the twelve study cities (src/util/cities.js).
export const IMPRINT_CITIES = new Set([
  "caloocan", "laspinas", "makati", "mandaluyong", "manila", "marikina",
  "muntinlupa", "paranaque", "pasay", "pasig", "quezoncity", "sanjuan",
]);

// Same 18 categories as src/util/taxonomy.js.
export const TAXONOMY_18 = new Set([
  "bench", "bicycle", "bollard", "car", "construction_materials",
  "electrical_box", "fire_hydrant", "garbage", "lamp_post",
  "motorcycle", "movable_signage", "potted_plant", "street_sign",
  "street_vendor_cart", "trash_bin", "tree", "tricycle", "utility_post",
]);

export const IMAGE_SOURCES = new Set(["mapillary", "atlas3"]);
export const BOX_KEYS = ["comment", "editable", "id", "isRejected", "mark", "selected"];
export const MODEL_VERSION_PATTERN = /^v\d+-\w[\w-]*$/;
const EDGE_TOLERANCE_PX = 0.01;

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/** Problems with one record, as human-readable strings. Empty when valid. */
export function validateImageRecord(r) {
  const p = [];
  const tag = `imageID ${r?.imageID}`;
  if (!r || typeof r !== "object") return ["record is not an object"];

  if (!Number.isSafeInteger(r.imageID) || r.imageID < 1) p.push(`${tag}: imageID must be a positive safe integer`);
  if (typeof r.sourceImageId !== "string" || !r.sourceImageId) p.push(`${tag}: sourceImageId must be a non-empty string`);
  if (!IMAGE_SOURCES.has(r.source)) p.push(`${tag}: unknown source ${JSON.stringify(r.source)}`);
  if (!IMPRINT_CITIES.has(r.city)) p.push(`${tag}: unknown city ${JSON.stringify(r.city)}`);
  if (r.imageName !== `${r.source}_${r.city}_${r.sourceImageId}.jpg`) p.push(`${tag}: imageName does not match source, city and sourceImageId`);
  if (r.url !== null) p.push(`${tag}: url must be null in the Step 3 records (it is set at import)`);
  if (r.annotationCount !== 0) p.push(`${tag}: annotationCount must be 0`);
  if (r.isReference !== false) p.push(`${tag}: isReference must be false`);
  if (r.poolStatus !== "unserved") p.push(`${tag}: poolStatus must be "unserved"`);
  if (!Array.isArray(r.referenceGroundTruth) || r.referenceGroundTruth.length !== 0) p.push(`${tag}: referenceGroundTruth must be []`);
  if (r.predictions !== null) p.push(`${tag}: predictions must be null`);
  if (typeof r.modelVersion !== "string" || !MODEL_VERSION_PATTERN.test(r.modelVersion)) p.push(`${tag}: modelVersion must match v<number>-<name>`);
  if (!Number.isInteger(r.width) || r.width < 1 || !Number.isInteger(r.height) || r.height < 1) p.push(`${tag}: width and height must be positive integers`);

  if (!Array.isArray(r.annotationList)) {
    p.push(`${tag}: annotationList must be an array`);
    return p;
  }
  const ids = new Set();
  for (const box of r.annotationList) {
    const keys = Object.keys(box || {}).sort();
    if (keys.join(",") !== BOX_KEYS.join(",")) {
      p.push(`${tag}: box has keys ${keys.join(",")}`);
      continue;
    }
    if (typeof box.id !== "string" || !box.id) p.push(`${tag}: box id must be a non-empty string`);
    else if (ids.has(box.id)) p.push(`${tag}: duplicate box id ${box.id}`);
    ids.add(box.id);
    if (!TAXONOMY_18.has(box.comment)) p.push(`${tag}: box ${box.id} category ${JSON.stringify(box.comment)} not in taxonomy`);
    if (box.selected !== false || box.editable !== false || box.isRejected !== false) p.push(`${tag}: box ${box.id} flags must all be false`);
    const m = box.mark || {};
    if (m.type !== "RECT" || ![m.x, m.y, m.width, m.height].every(isFiniteNumber)) {
      p.push(`${tag}: box ${box.id} mark must have numeric x, y, width, height and type RECT`);
      continue;
    }
    if (m.width <= 0 || m.height <= 0) p.push(`${tag}: box ${box.id} has non-positive size`);
    if (m.x < 0 || m.y < 0 || m.x + m.width > r.width + EDGE_TOLERANCE_PX || m.y + m.height > r.height + EDGE_TOLERANCE_PX) {
      p.push(`${tag}: box ${box.id} lies outside the ${r.width}x${r.height} image`);
    }
  }
  return p;
}

/** Validates the whole set, including uniqueness across records. */
export function validateImageRecords(records) {
  if (!Array.isArray(records)) return { problems: ["records must be an array"], counts: null };
  const problems = [];
  const seen = { imageID: new Set(), imageName: new Set(), source: new Set() };
  const counts = { total: records.length, bySource: {}, byCity: {}, boxes: 0 };
  for (const r of records) {
    problems.push(...validateImageRecord(r));
    if (seen.imageID.has(r?.imageID)) problems.push(`duplicate imageID ${r.imageID}`);
    if (seen.imageName.has(r?.imageName)) problems.push(`duplicate imageName ${r.imageName}`);
    const sourceKey = `${r?.source}:${r?.sourceImageId}`;
    if (seen.source.has(sourceKey)) problems.push(`duplicate source image ${sourceKey}`);
    seen.imageID.add(r?.imageID);
    seen.imageName.add(r?.imageName);
    seen.source.add(sourceKey);
    counts.bySource[r?.source] = (counts.bySource[r?.source] || 0) + 1;
    counts.byCity[r?.city] = (counts.byCity[r?.city] || 0) + 1;
    counts.boxes += Array.isArray(r?.annotationList) ? r.annotationList.length : 0;
  }
  return { problems, counts };
}

/**
 * The documents to insert: each record with `url` set to urlPrefix + imageName.
 * urlPrefix must start with "/" (same-origin path) and end with "/".
 * Returns new objects and leaves the input untouched.
 */
export function prepareImageDocs(records, urlPrefix) {
  if (typeof urlPrefix !== "string" || !urlPrefix.startsWith("/") || !urlPrefix.endsWith("/")) {
    throw new Error('urlPrefix must start and end with "/", for example "/corpus-images/"');
  }
  return records.map((r) => ({ ...r, url: `${urlPrefix}${r.imageName}` }));
}
