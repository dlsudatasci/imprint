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

  // With no sidewalk, the absence itself is the recorded barrier (chapter_4.tex,
  // Sidewalk Segmentation Annotation), and the other three questions ask about
  // "this sidewalk", so they are left unanswered (decided 2 Oct 2026). The UI
  // greys them out and clears any earlier answers when "None" is chosen.
  if (sceneLevel.sidewalkWidth === "no_sidewalk") {
    for (const key of ["surfaceCondition", "walkability", "overallAccessibility"]) {
      if (sceneLevel[key] !== null && sceneLevel[key] !== undefined) {
        return { valid: false, message: `${key} must be empty when there is no sidewalk.` };
      }
    }
    return { valid: true };
  }

  const sc = Number(sceneLevel.surfaceCondition);
  if (!Number.isInteger(sc) || sc < 1 || sc > 3) {
    return { valid: false, message: "sceneLevel.surfaceCondition must be 1–3 when a sidewalk is present." };
  }

  const walkVal = Number(sceneLevel.walkability);
  if (!Number.isInteger(walkVal) || walkVal < 1 || walkVal > 3) {
    return { valid: false, message: "sceneLevel.walkability must be an integer from 1 to 3." };
  }

  const accVal = Number(sceneLevel.overallAccessibility);
  if (!Number.isInteger(accVal) || accVal < 1 || accVal > 5) {
    return { valid: false, message: "sceneLevel.overallAccessibility must be an integer from 1 to 5." };
  }

  return { valid: true };
}

export function validateBoxes(selectedObjectsID, newObjects, { requireSeverity = true } = {}) {
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
    if (requireSeverity && box.obstructs === true) {
      const sev = Number(box.severity);
      if (!Number.isInteger(sev) || sev < 1 || sev > 5) {
        return { valid: false, message: "Obstructing objects must have a severity rating from 1 to 5." };
      }
    }
  }

  return { valid: true };
}

// Annotators record boxes, categories and Yes/No only (decided 3 Oct 2026), so
// the server drops any scene answers or severities an old client still sends.
// Takes { sceneLevel, selectedObjectsID, newObjects }. The incoming sceneLevel
// is discarded whatever it holds. The input is not mutated.
export function normalizeAnnotatorSubmission({ selectedObjectsID, newObjects }) {
  const clearSeverity = (boxes) =>
    Array.isArray(boxes) ? boxes.map((box) => ({ ...box, severity: null })) : boxes;
  return {
    sceneLevel: null,
    selectedObjectsID: clearSeverity(selectedObjectsID),
    newObjects: clearSeverity(newObjects),
  };
}
