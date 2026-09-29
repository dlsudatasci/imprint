/**
 * Title-cases an underscore-separated label.
 * "fire_hydrant" → "Fire Hydrant", "tree" → "Tree"
 */
export function formatLabel(comment) {
  if (!comment || comment === "---") return null;
  if (comment === "not_an_object") return "Not an object";
  return comment
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Assigns numbered display labels to annotations so same-category
 * objects can be distinguished: "Tree #1", "Tree #2".
 *
 * Singletons keep a plain label ("Bollard"). Unlabeled annotations
 * (no comment, empty, or "---") get null.
 *
 * The numbering follows the order of the input array — callers
 * should pass annotations sorted by id (the same order the UI
 * renders them) for stable, predictable numbering.
 *
 * @param {Array<{id: string, comment?: string}>} annotations
 * @returns {Map<string, string|null>} id → display label
 */
export function buildDisplayLabels(annotations) {
  const counts = {};
  for (const ann of annotations) {
    const cat = ann.comment;
    if (cat && cat !== "---") {
      counts[cat] = (counts[cat] || 0) + 1;
    }
  }

  const counters = {};
  const labels = new Map();

  for (const ann of annotations) {
    const cat = ann.comment;
    if (!cat || cat === "---") {
      labels.set(ann.id, null);
      continue;
    }

    const titleCased = formatLabel(cat);

    if (counts[cat] > 1) {
      counters[cat] = (counters[cat] || 0) + 1;
      labels.set(ann.id, `${titleCased} #${counters[cat]}`);
    } else {
      labels.set(ann.id, titleCased);
    }
  }

  return labels;
}
