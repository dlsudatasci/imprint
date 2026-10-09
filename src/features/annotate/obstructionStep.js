import { NOT_AN_OBJECT } from "@/util/suggestionJudgment";
import { normalizeMark, markArea } from "@/util/boxGeometry";
import { compareAppearance } from "@/util/buildDisplayLabels";

/**
 * The annotator's Obstructions step (decided 4 Oct 2026). For every object
 * kept or drawn in the Objects step, the annotator clicks the ones that
 * obstruct the sidewalk for them, then confirms that the rest do not. Every
 * real object then carries obstructs: true or false, the label the obstruction
 * classifier is trained to reproduce (chapter_4.tex line 69).
 *
 * Until submit, an unmarked object has obstructs: null ("not yet answered").
 * finalizeObstructionAnswers turns it into false once the annotator confirms.
 */

/** The boxes this step asks about: drawn boxes and kept suggestions, never Not an object. */
export function isRealObject(box) {
  if (!box || box.comment === NOT_AN_OBJECT) return false;
  return box.editable === true || box.selected === true;
}

// Same order as the tool's sortedAnnotations
// The same order as the other lists and the numbers on the photo: suggestions
// in the model's order, then drawn boxes in the order drawn (8 Oct 2026)
const byAppearance = compareAppearance;

export function realObjects(annotations = []) {
  return (annotations || []).filter(isRealObject).sort(byAppearance);
}

export function summarizeObstructionStep(annotations = []) {
  const objects = realObjects(annotations);
  return { objects: objects.length, marked: objects.filter((box) => box.obstructs === true).length };
}

/** Marking toggles between obstructing and not yet answered. Severity is never asked. */
export function toggleObstructionPatch(box) {
  return { obstructs: box?.obstructs === true ? null : true, severity: null };
}

/**
 * Copies for submit: marked objects obstruct, every other real object does
 * not, Not an object boxes carry no answer, and no box has a severity.
 */
export function finalizeObstructionAnswers(annotations = []) {
  return (annotations || []).map((box) => ({
    ...box,
    obstructs: isRealObject(box) ? box.obstructs === true : null,
    severity: null,
  }));
}

/**
 * The real object under the point, or null. When boxes overlap the smallest
 * wins, the same rule as DefaultAnnotationState: picking the topmost would make
 * a small box nested inside a large one unreachable.
 */
export function pickJudgeTarget(annotations = [], x, y) {
  let best = null;
  let bestArea = Infinity;
  for (const box of annotations || []) {
    if (!isRealObject(box) || !box.mark) continue;
    const m = normalizeMark(box.mark);
    if (x < m.x || x > m.x + m.width || y < m.y || y > m.y + m.height) continue;
    const area = markArea(m);
    if (area < bestArea) {
      best = box;
      bestArea = area;
    }
  }
  return best;
}
