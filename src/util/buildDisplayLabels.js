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

/**
 * Order of appearance (8 Oct 2026): the model's suggestions first, in the
 * model's own order, then the boxes the person drew, in the order they were
 * drawn. Same-category objects are numbered in this order ("Lamp Post #1",
 * "#2"), and the lists under the photo are shown in it, so #1 comes first.
 *
 * Suggestion ids are "pred-0", "pred-1"... so they are compared as numbers
 * ("pred-2" before "pred-10"). A drawn box carries drawnOrder, the time it was
 * drawn. That is kept in the browser's session copy so a refresh keeps the
 * order, and left out of what is submitted. A drawn box without it (one
 * restored from the server on another device) comes after those with it, by
 * id.
 *
 * Before this the numbers followed the ids alphabetically: suggestions fell
 * out of the model's order past ten, and a drawn box's random id put it at a
 * random place, renumbering the others.
 */
export function compareAppearance(a, b) {
  const aDrawn = a?.editable === true;
  const bDrawn = b?.editable === true;
  if (aDrawn !== bDrawn) return aDrawn ? 1 : -1;
  if (aDrawn) {
    const aOrder = Number.isFinite(a.drawnOrder) ? a.drawnOrder : Infinity;
    const bOrder = Number.isFinite(b.drawnOrder) ? b.drawnOrder : Infinity;
    if (aOrder !== bOrder) return aOrder < bOrder ? -1 : 1;
  }
  return String(a?.id).localeCompare(String(b?.id), "en", { numeric: true });
}

/** A copy of the boxes in order of appearance. Never reorders its input. */
export function orderOfAppearance(annotations) {
  return [...(annotations || [])].sort(compareAppearance);
}

/**
 * The labels numbered in order of appearance, whatever order the boxes arrive
 * in. The labels drawn on the photo and the lists under it both come from
 * here, so "Lamp Post #2" is the same box in both. The canvas keeps its boxes
 * in drawing order, which changes on every click (the clicked box moves to the
 * end so it is drawn on top), and numbering in that order renumbered the boxes
 * on the photo each time one was clicked.
 *
 * @param {Array<{id: string, comment?: string, editable?: boolean, drawnOrder?: number}>} annotations
 * @returns {Map<string, string|null>} id → display label
 */
export function buildDisplayLabelsInOrder(annotations) {
  return buildDisplayLabels(orderOfAppearance(annotations));
}
