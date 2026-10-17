import { isTaxonomyCategory } from "@/util/taxonomy";
import { isDecidedForObjects, isNotAnObject } from "@/util/suggestionJudgment";
import { normalizeMark } from "@/util/boxGeometry";
import { computeIoU } from "@/util/validators/qualityMetrics";

/**
 * Progress of the annotator's Step 1 (Objects) on one image, for the
 * "Objects in This Image" card under the canvas (4 Oct 2026).
 */

// Same order as the tool's sortedAnnotations, so toDecideIds follows the order
// the card lists the boxes in
const byId = (a, b) => String(a.id).localeCompare(String(b.id));

export function summarizeObjectStep(annotations = []) {
  const boxes = [...(annotations || [])].sort(byId);
  const suggestions = boxes.filter((b) => !b.editable);
  const drawnBoxes = boxes.filter((b) => b.editable);
  const keptBoxes = suggestions.filter((b) => b.selected === true);
  // Real boxes with no category from the list yet: a box just drawn or added, usually
  const unlabeledIds = [...keptBoxes, ...drawnBoxes].filter((b) => !isTaxonomyCategory(b.comment)).map((b) => b.id);

  return {
    suggestions: suggestions.length,
    decided: suggestions.filter(isDecidedForObjects).length,
    kept: keptBoxes.length,
    notAnObject: suggestions.filter((b) => b.selected !== true && isNotAnObject(b)).length,
    drawn: drawnBoxes.length,
    unlabeled: unlabeledIds.length,
    unlabeledIds,
    toDecideIds: suggestions.filter((b) => !isDecidedForObjects(b)).map((b) => b.id),
  };
}

/**
 * The boxes Step 1 still waits on (17 Oct 2026, an annotators' suggestion):
 * the suggestions still to decide, and the real boxes with no category, such
 * as a box just added. Both block Next (validateObjectStep).
 */
export function unfinishedObjectIds(annotations = []) {
  const { toDecideIds, unlabeledIds } = summarizeObjectStep(annotations);
  return [...toDecideIds, ...unlabeledIds];
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

/**
 * The boxes with the given ones first, each group in the order given (14 Oct
 * 2026, phones and tablets). The chips at the top of the annotators' sheet
 * scroll sideways, so a box left to finish could sit out of sight behind the
 * decided ones. The tool passes unfinishedObjectIds: suggestions still to
 * decide and, from 17 Oct 2026, boxes with no category. The names
 * ("Tree #1") do not change.
 */
export function toDecideFirst(boxes = [], toDecideIds = []) {
  const toDecide = new Set(toDecideIds || []);
  const list = boxes || [];
  return [...list.filter((box) => toDecide.has(box.id)), ...list.filter((box) => !toDecide.has(box.id))];
}
