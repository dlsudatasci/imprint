/**
 * "What Counts as an Obstruction", shown beside the canvas in the annotator's
 * Obstructions step (4 Oct 2026). From chapter_4.tex line 69 (the judgment is
 * the annotator's own, and objects outside the walking space obstruct nobody)
 * and line 408 (a negative answer is as informative as a positive one).
 */
export const OBSTRUCTION_GUIDE = Object.freeze([
  "An object obstructs when it narrows the walking space so much that you, traveling as you normally do, could not pass it comfortably and safely.",
  "Judge for yourself, not for an average pedestrian. The same object can obstruct one person and not another.",
  "An object entirely outside the walking space, such as a car on the road or a tree in a planting bed, does not obstruct anyone. Leave it unmarked.",
  "Not obstructing is just as useful an answer as obstructing.",
  "To fix a box or a category, go back to Objects.",
]);
