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
