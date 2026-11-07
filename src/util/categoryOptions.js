import { TAXONOMY_CATEGORIES } from "@/util/taxonomy";

/**
 * Labels for the category dropdown, one per taxonomy value. Both box panels
 * (DefaultInputSection for contributors, ObjectInputSection for annotators)
 * build their list from CATEGORY_OPTIONS, so the dropdown cannot drift from the
 * taxonomy.
 *
 * "Car" covers every motor vehicle with four or more wheels (decided 4 Oct
 * 2026). The label is just "Car" (6 Oct 2026). The rule is shown in the
 * annotators' "What to Box" list instead. The stored value stays "car".
 */
const LABELS = {
  bench: "Bench",
  bicycle: "Bicycle",
  bollard: "Bollard",
  car: "Car",
  construction_materials: "Construction Materials",
  electrical_box: "Electrical Box",
  fire_hydrant: "Fire Hydrant",
  garbage: "Garbage",
  lamp_post: "Lamp Post",
  motorcycle: "Motorcycle",
  movable_signage: "Movable Signage",
  potted_plant: "Potted Plant",
  street_sign: "Street Sign",
  street_vendor_cart: "Street Vendor Cart",
  trash_bin: "Trash Bin",
  tree: "Tree",
  tricycle: "Tricycle",
  utility_post: "Utility Post",
};

export const CATEGORY_OPTIONS = Object.freeze(
  TAXONOMY_CATEGORIES.map((value) => Object.freeze({ value, label: LABELS[value] }))
);

/**
 * The category option a value names, or null (S20, 7 Nov 2026): the value
 * itself (`utility_post`), its label in any case ("Utility Post", "utility
 * post") or the value with spaces for underscores. The box panel turns such a
 * value into the option's value when it opens, and answerSignature reads both
 * as one category, so a category written two ways is not a change.
 */
export function matchCategory(value) {
  if (typeof value !== "string" || !value) return null;
  const lower = value.toLowerCase();
  return CATEGORY_OPTIONS.find(
    (opt) => opt.value === value || opt.label.toLowerCase() === lower || opt.value.replace(/_/g, " ") === lower
  ) ?? null;
}

/** The option's value for a value that names one, otherwise the value as given (a category typed in with Other...) */
export function categoryKey(value) {
  return matchCategory(value)?.value ?? value;
}
