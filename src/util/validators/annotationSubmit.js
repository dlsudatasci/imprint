import { NOT_AN_OBJECT } from "@/util/suggestionJudgment";

export const MAX_BOXES_PER_IMAGE = 300;
export const SIDEWALK_WIDTH_OPTIONS = ["no_sidewalk", "one_person", "two_people", "three_or_more"];

export function validateSceneLevel(sceneLevel) {
  if (!sceneLevel || typeof sceneLevel !== "object") {
    return { valid: false, message: "sceneLevel is required." };
  }

  if (!SIDEWALK_WIDTH_OPTIONS.includes(sceneLevel.sidewalkWidth)) {
    return { valid: false, message: "Invalid sidewalk width value." };
  }

  if (sceneLevel.sidewalkWidth === "no_sidewalk") {
    if (sceneLevel.surfaceCondition !== null && sceneLevel.surfaceCondition !== undefined) {
      return { valid: false, message: "surfaceCondition must be null when there is no sidewalk." };
    }
  } else {
    const sc = Number(sceneLevel.surfaceCondition);
    if (!Number.isInteger(sc) || sc < 1 || sc > 4) {
      return { valid: false, message: "sceneLevel.surfaceCondition must be 1–4 when a sidewalk is present." };
    }
  }

  const walkVal = Number(sceneLevel.walkability);
  if (!Number.isInteger(walkVal) || walkVal < 1 || walkVal > 5) {
    return { valid: false, message: "sceneLevel.walkability must be an integer from 1 to 5." };
  }

  const accVal = Number(sceneLevel.overallAccessibility);
  if (!Number.isInteger(accVal) || accVal < 1 || accVal > 5) {
    return { valid: false, message: "sceneLevel.overallAccessibility must be an integer from 1 to 5." };
  }

  return { valid: true };
}

export function validateBoxes(selectedObjectsID, newObjects) {
  if (!Array.isArray(selectedObjectsID) || !Array.isArray(newObjects)) {
    return { valid: false, message: "selectedObjectsID and newObjects must be arrays." };
  }

  if (selectedObjectsID.length + newObjects.length > MAX_BOXES_PER_IMAGE) {
    return { valid: false, message: "Too many boxes for a single image." };
  }

  for (const box of newObjects) {
    if (box.comment === NOT_AN_OBJECT) {
      return { valid: false, message: "Only model suggestions can be marked as not an object." };
    }
  }

  for (const box of selectedObjectsID) {
    if (box.comment === NOT_AN_OBJECT && box.obstructs !== false) {
      return { valid: false, message: "A box marked as not an object cannot be an obstruction." };
    }
  }

  const allBoxes = [...selectedObjectsID, ...newObjects];
  for (const box of allBoxes) {
    if (typeof box.obstructs !== "boolean") {
      return { valid: false, message: "Every object must have an obstruction judgment (obstructs: true/false)." };
    }
    if (box.obstructs === true) {
      const sev = Number(box.severity);
      if (!Number.isInteger(sev) || sev < 1 || sev > 5) {
        return { valid: false, message: "Obstructing objects must have a severity rating from 1 to 5." };
      }
    }
  }

  return { valid: true };
}
