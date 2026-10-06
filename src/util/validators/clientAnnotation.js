import { isDecidedForObjects } from "@/util/suggestionJudgment";
import { isTaxonomyCategory } from "@/util/taxonomy";
import { realObjects } from "@/features/annotate/obstructionStep";
import { validateSidewalkMask } from "@/util/validators/sidewalkMask";

/**
 * The annotator's Objects step (decided 4 Oct 2026): every suggestion is kept
 * or marked Not an object, and every kept or drawn box has one of the 18
 * categories. Everything can be checked from existingAnnotations, which holds
 * every box on the canvas.
 */
export function validateObjectStep(existingAnnotations) {
  const boxes = existingAnnotations || [];
  if (boxes.some((box) => !box.editable && !isDecidedForObjects(box))) {
    return { valid: false, error: "Please click Keep or Not an object on every suggested box." };
  }
  const real = boxes.filter((box) => box.editable || box.selected === true);
  if (real.some((box) => !isTaxonomyCategory(box.comment))) {
    return { valid: false, error: "Please choose a category from the list for every box." };
  }
  return { valid: true };
}

/**
 * The annotator's Obstructions step (decided 4 Oct 2026): unmarked objects
 * become "does not obstruct" only after the annotator confirms it, so a "No"
 * is never recorded by default (the principle of chapter_4.tex line 182).
 * An image with no real objects has nothing to confirm.
 */
export function validateObstructionStep({ annotations, confirmed }) {
  if (realObjects(annotations).length === 0) return { valid: true };
  if (confirmed !== true) {
    return {
      valid: false,
      error: "Please tick the box to confirm that the objects you did not mark do not obstruct the sidewalk.",
    };
  }
  return { valid: true };
}

/**
 * The annotator's Sidewalk step (6 Oct 2026), on model-development images only.
 * A half-drawn shape must be finished or cancelled, then the outline must pass
 * validateSidewalkMask (at least one walking space shape, or No sidewalk).
 */
export function validateSidewalkStep({ askSidewalk, mask, hasDraft, imageWidth, imageHeight }) {
  if (!askSidewalk) return { valid: true };
  if (hasDraft) return { valid: false, error: "Finish or cancel the shape you are drawing." };
  const result = validateSidewalkMask(mask, imageWidth, imageHeight);
  return result.valid ? { valid: true } : { valid: false, error: result.message };
}

export function validateAnnotationForSubmit({
  existingAnnotations,
  newObjects,
  selectedObjects,
  sceneLevel,
  isAnnotator = false,
  obstructionsConfirmed = false,
  askSidewalk = false,
  sidewalkMask = null,
  sidewalkDraftOpen = false,
  imageWidth,
  imageHeight,
}) {
  if (isAnnotator) {
    const objects = validateObjectStep(existingAnnotations);
    if (!objects.valid) return objects;
    const sidewalk = validateSidewalkStep({
      askSidewalk,
      mask: sidewalkMask,
      hasDraft: sidewalkDraftOpen,
      imageWidth,
      imageHeight,
    });
    if (!sidewalk.valid) return sidewalk;
    return validateObstructionStep({ annotations: existingAnnotations, confirmed: obstructionsConfirmed });
  }

  const unconfirmed = (existingAnnotations || []).filter(
    (el) => !el.editable && !el.selected && !el.isRejected
  );

  if (unconfirmed.length > 0) {
    return { valid: false, error: "Please click Yes or No on all existing annotations before submitting." };
  }

  const objectsToValidate = [...(newObjects || []), ...(selectedObjects || [])];
  for (const object of objectsToValidate) {
    if (!object.comment || object.comment === "---") {
      return { valid: false, error: "You have an unlabeled object. Please select a label for all the boxes." };
    }
  }

  const confirmedExisting = (existingAnnotations || []).filter(
    (el) => !el.editable && !el.isRejected
  );
  const allBoxes = [...confirmedExisting, ...(newObjects || [])];
  for (const object of allBoxes) {
    if (object.obstructs === undefined || object.obstructs === null) {
      return { valid: false, error: "Please indicate whether each object obstructs the sidewalk." };
    }
    if (object.obstructs === true && (object.severity === undefined || object.severity === null)) {
      return { valid: false, error: "Please rate the severity of each obstruction (1–5)." };
    }
  }

  if (!sceneLevel || !sceneLevel.sidewalkWidth) {
    return { valid: false, error: "Please select the sidewalk width category." };
  }
  // With no sidewalk the other three questions are greyed out and left empty
  // (decided 2 Oct 2026), so they are only required when a sidewalk is present.
  if (sceneLevel.sidewalkWidth !== "no_sidewalk") {
    if (sceneLevel.surfaceCondition === null || sceneLevel.surfaceCondition === undefined) {
      return { valid: false, error: "Please rate the surface condition." };
    }
    if (sceneLevel.walkability === null || sceneLevel.walkability === undefined) {
      return { valid: false, error: "Please rate the walking comfort." };
    }
    if (sceneLevel.overallAccessibility === null || sceneLevel.overallAccessibility === undefined) {
      return { valid: false, error: "Please rate accessibility." };
    }
  }

  return { valid: true };
}
