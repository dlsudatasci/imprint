/**
 * The fixed 18-category obstruction taxonomy from Table 4.1.
 *
 * Values match the `comment` field stored on annotation boxes.
 * All 18 appear in the category dropdown (src/util/categoryOptions.js) and in
 * model predictions (v0-mapillary).
 *
 * Annotations with a category NOT in this list (free-text "Other" entries)
 * are excluded from the retraining feed but kept in the full research export.
 */
export const TAXONOMY_CATEGORIES = [
  "bench",
  "bicycle",
  "bollard",
  "car",
  "construction_materials",
  "electrical_box",
  "fire_hydrant",
  "garbage",
  "lamp_post",
  "motorcycle",
  "movable_signage",
  "potted_plant",
  "street_sign",
  "street_vendor_cart",
  "trash_bin",
  "tree",
  "tricycle",
  "utility_post",
];

export const TAXONOMY_SET = new Set(TAXONOMY_CATEGORIES);

export function isTaxonomyCategory(category) {
  return TAXONOMY_SET.has(category);
}

/**
 * The taxonomy grouped by permanence, as Table 4.1 (tab:obstruction_categories
 * in chapter_4.tex) lists it, in its order (16 Oct 2026, for the About page and
 * the annotation guide). Temporary objects come and go with daily street use,
 * permanent ones are fixed infrastructure. taxonomy.test.js checks the two
 * groups hold every category exactly once.
 */
export const TAXONOMY_BY_PERMANENCE = Object.freeze({
  temporary: Object.freeze([
    "car",
    "motorcycle",
    "tricycle",
    "bicycle",
    "street_vendor_cart",
    "construction_materials",
    "garbage",
    "movable_signage",
  ]),
  permanent: Object.freeze([
    "trash_bin",
    "utility_post",
    "lamp_post",
    "street_sign",
    "fire_hydrant",
    "electrical_box",
    "bench",
    "tree",
    "potted_plant",
    "bollard",
  ]),
});
