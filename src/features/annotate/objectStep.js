import { isTaxonomyCategory } from "@/util/taxonomy";
import { isDecidedForObjects, isNotAnObject } from "@/util/suggestionJudgment";
import { normalizeMark } from "@/util/boxGeometry";
import { computeIoU } from "@/util/validators/qualityMetrics";

/**
 * Progress of the annotator's Step 1 (Objects) on one image, for the
 * "Objects in This Image" card under the canvas (4 Oct 2026).
 */

// Same order as the tool's sortedAnnotations, so "Next suggestion to decide"
// walks the boxes in the order the card lists them
const byId = (a, b) => String(a.id).localeCompare(String(b.id));

export function summarizeObjectStep(annotations = []) {
  const boxes = [...(annotations || [])].sort(byId);
  const suggestions = boxes.filter((b) => !b.editable);
  const drawnBoxes = boxes.filter((b) => b.editable);
  const keptBoxes = suggestions.filter((b) => b.selected === true);

  return {
    suggestions: suggestions.length,
    decided: suggestions.filter(isDecidedForObjects).length,
    kept: keptBoxes.length,
    notAnObject: suggestions.filter((b) => b.selected !== true && isNotAnObject(b)).length,
    drawn: drawnBoxes.length,
    unlabeled: [...keptBoxes, ...drawnBoxes].filter((b) => !isTaxonomyCategory(b.comment)).length,
    toDecideIds: suggestions.filter((b) => !isDecidedForObjects(b)).map((b) => b.id),
  };
}

/**
 * Pairs of real boxes (kept suggestions and drawn boxes) that overlap almost
 * completely, usually a box drawn over a suggestion instead of keeping it.
 * Shown as a note only and never blocks.
 */
export function findNearDuplicates(annotations = [], threshold = 0.8) {
  const real = [...(annotations || [])]
    .filter((b) => b && b.mark && !isNotAnObject(b) && (b.editable || b.selected === true))
    .sort(byId);
  const pairs = [];
  for (let i = 0; i < real.length; i++) {
    for (let j = i + 1; j < real.length; j++) {
      const iou = computeIoU(normalizeMark(real[i].mark), normalizeMark(real[j].mark));
      if (iou >= threshold) pairs.push({ a: real[i], b: real[j], iou });
    }
  }
  return pairs;
}
