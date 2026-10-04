import { isDecidedForObjects } from "@/util/suggestionJudgment";
import { isTaxonomyCategory } from "@/util/taxonomy";

/**
 * Annotators do Step 1 Objects only (decided 4 Oct 2026): every suggestion is
 * kept or marked Not an object, and every kept or drawn box has one of the 18
 * categories. No obstruction answer, severity or scene answers. Everything can
 * be checked from existingAnnotations, which holds every box on the canvas.
 */
function validateObjectStep(existingAnnotations) {
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

export function validateAnnotationForSubmit({
  existingAnnotations,
  newObjects,
  selectedObjects,
  sceneLevel,
  isAnnotator = false,
}) {
  if (isAnnotator) {
    return validateObjectStep(existingAnnotations);
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
