import { NOT_AN_OBJECT } from "@/util/suggestionJudgment";
import { isTaxonomyCategory } from "@/util/taxonomy";
import { normalizeMark, clampMark, markArea } from "@/util/boxGeometry";

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

// Annotators record boxes and categories only from 4 Oct 2026 (Step 1
// Objects). Obstruction answers come in a later annotator step, so the server
// drops any scene answers, obstruction answers or severities an old client
// still sends. Takes { sceneLevel, selectedObjectsID, newObjects }. The
// incoming sceneLevel is discarded whatever it holds. The input is not mutated.
export function normalizeAnnotatorSubmission({ selectedObjectsID, newObjects }) {
  const clearJudgments = (boxes) =>
    Array.isArray(boxes) ? boxes.map((box) => ({ ...box, obstructs: null, severity: null })) : boxes;
  return {
    sceneLevel: null,
    selectedObjectsID: clearJudgments(selectedObjectsID),
    newObjects: clearJudgments(newObjects),
  };
}

const hasNumericMark = (box) =>
  box?.mark != null &&
  typeof box.mark === "object" &&
  ["x", "y", "width", "height"].every((k) => typeof box.mark[k] === "number" && Number.isFinite(box.mark[k]));

/**
 * The annotator's Step 1 rules (4 Oct 2026): every drawn box has one of the 18
 * categories, every suggestion is kept with one of the 18 or marked not an
 * object, and every box has a numeric mark. No free-text "Other" category,
 * since an "other" box cannot train an 18-class detector (chapter_4.tex line 59).
 */
export function validateAnnotatorObjectBoxes(selectedObjectsID, newObjects) {
  if (!Array.isArray(selectedObjectsID) || !Array.isArray(newObjects)) {
    return { valid: false, message: "selectedObjectsID and newObjects must be arrays." };
  }

  if (selectedObjectsID.length + newObjects.length > MAX_BOXES_PER_IMAGE) {
    return { valid: false, message: "Too many boxes for a single image." };
  }

  for (const box of newObjects) {
    if (box?.comment === NOT_AN_OBJECT) {
      return { valid: false, message: "Only model suggestions can be marked as not an object." };
    }
    if (!isTaxonomyCategory(box?.comment)) {
      return { valid: false, message: "Every box must have a category from the list." };
    }
  }

  for (const box of selectedObjectsID) {
    if (box?.comment === NOT_AN_OBJECT) continue;
    if (box?.selected !== true) {
      return { valid: false, message: "Every suggested box must be kept or marked not an object." };
    }
    if (!isTaxonomyCategory(box.comment)) {
      return { valid: false, message: "Every box must have a category from the list." };
    }
  }

  if (![...selectedObjectsID, ...newObjects].every(hasNumericMark)) {
    return { valid: false, message: "Every box must have a position (x, y, width and height)." };
  }

  return { valid: true };
}

const hasMarkObject = (box) => box?.mark != null && typeof box.mark === "object";

/**
 * Both roles: copies of the boxes with each mark normalized (positive width and
 * height) and clipped to the image. initialState, the pipeline's own box, is
 * left alone. Not an object boxes and boxes with no mark are passed through.
 */
export function normalizeSubmittedMarks(boxes, imageWidth, imageHeight) {
  if (!Array.isArray(boxes)) return boxes;
  return boxes.map((box) => {
    if (!hasMarkObject(box) || box.comment === NOT_AN_OBJECT) return box;
    return { ...box, mark: clampMark(normalizeMark(box.mark), imageWidth, imageHeight) };
  });
}

/** Both roles: true when any real box with a mark has no area (inside the image, once clamped). */
export function hasEmptyBox(boxes) {
  if (!Array.isArray(boxes)) return false;
  return boxes.some((box) => hasMarkObject(box) && box.comment !== NOT_AN_OBJECT && !(markArea(box.mark) > 0));
}
