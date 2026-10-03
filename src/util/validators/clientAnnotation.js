// Annotators answer no scene-level questions and give no severity (decided
// 3 Oct 2026). They still decide every suggestion, label every box and answer
// Yes or No for every box, suggested or drawn.
export function validateAnnotationForSubmit({
  existingAnnotations,
  newObjects,
  selectedObjects,
  sceneLevel,
  isAnnotator = false,
}) {
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
    if (!isAnnotator && object.obstructs === true && (object.severity === undefined || object.severity === null)) {
      return { valid: false, error: "Please rate the severity of each obstruction (1–5)." };
    }
  }

  if (isAnnotator) {
    return { valid: true };
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
