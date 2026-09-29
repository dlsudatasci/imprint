export function validateAnnotationForSubmit({ existingAnnotations, newObjects, selectedObjects, sceneLevel }) {
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
  if (sceneLevel.sidewalkWidth !== "no_sidewalk" && sceneLevel.surfaceCondition === null) {
    return { valid: false, error: "Please rate the surface condition." };
  }
  if (sceneLevel.walkability === null) {
    return { valid: false, error: "Please rate the walkability." };
  }
  if (sceneLevel.overallAccessibility === null) {
    return { valid: false, error: "Please rate the overall accessibility." };
  }

  return { valid: true };
}
