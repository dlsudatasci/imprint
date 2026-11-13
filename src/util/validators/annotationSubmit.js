import { NOT_AN_OBJECT } from "@/util/suggestionJudgment";
import { isTaxonomyCategory } from "@/util/taxonomy";
import { normalizeMark, clampMark, markArea } from "@/util/boxGeometry";
import { isProposal, recordProbability, proposalWasShown } from "@/util/modelProposal";
import {
  SIDEWALK_WIDTH_OPTIONS,
  SURFACE_TYPE_OPTIONS,
  EVENNESS_OPTIONS,
  SCENE_NUMBERED,
  SCENE_KEYS,
  emptySceneLevel,
  requiredSceneKeys,
} from "@/util/validators/sceneQuestions.mjs";

export const MAX_BOXES_PER_IMAGE = 300;

export { SIDEWALK_WIDTH_OPTIONS };

/** The server's message for a contributor's body with no Step 1 answer, sent only by a tab opened before S15 */
export const RELOAD_FOR_NEW_QUESTIONS = "IMPRINT was updated. Please reload the page to see the new questions.";

/** Contributors' Step 1 (S15): exactly true (a sidewalk) or false (only a path) */
export function isPresenceAnswer(hasSidewalk) {
  return hasSidewalk === true || hasSidewalk === false;
}

const isGiven = (v) => v !== null && v !== undefined;
// A numbered answer sent as "3" is read as 3, as before S15, and stored as a number
const asInteger = (v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? Number(v) : NaN);
const isIntegerIn = (v, top) => Number.isInteger(asInteger(v)) && asInteger(v) >= 1 && asInteger(v) <= top;

const SCENE_RULES = {
  sidewalkWidth: (v) => SIDEWALK_WIDTH_OPTIONS.includes(v),
  overallAccessibility: (v) => isIntegerIn(v, SCENE_NUMBERED.overallAccessibility),
  // Sloped or Flat only from S27 (13 Nov 2026). 1 (Uneven) stays in stored rows only.
  surfaceEvenness: (v) => EVENNESS_OPTIONS.includes(asInteger(v)),
  surfaceType: (v) => SURFACE_TYPE_OPTIONS.includes(v),
  surfaceCondition: (v) => isIntegerIn(v, SCENE_NUMBERED.surfaceCondition),
  roadBarrier: (v) => v === true || v === false,
};

const SCENE_MESSAGES = {
  sidewalkWidth: "sceneLevel.sidewalkWidth must be one_person, two_people or three_or_more.",
  overallAccessibility: "sceneLevel.overallAccessibility must be an integer from 1 to 5.",
  surfaceEvenness: "sceneLevel.surfaceEvenness must be 2 (Sloped) or 3 (Flat).",
  surfaceType: "sceneLevel.surfaceType must be concrete, tiles, pavers or unpaved.",
  surfaceCondition: "sceneLevel.surfaceCondition must be an integer from 1 to 3.",
  roadBarrier: "sceneLevel.roadBarrier must be true or false.",
};

/**
 * Contributors' Step 3 (S15, question set 2, validators/sceneQuestions.mjs).
 * Every key in requiredSceneKeys(hasSidewalk) must hold a valid answer: all
 * six for a sidewalk, Ease of Navigation and Evenness for a path, whose four
 * SIDEWALK_ONLY_KEYS must be null or absent. Any key outside SCENE_KEYS
 * (walkability among them) is refused. Gives { valid: true, sceneLevel }
 * with the six keys, null where not asked, which the route stores.
 */
export function validateSceneLevel(sceneLevel, hasSidewalk) {
  if (!sceneLevel || typeof sceneLevel !== "object" || Array.isArray(sceneLevel)) {
    return { valid: false, message: "sceneLevel is required." };
  }
  if (!isPresenceAnswer(hasSidewalk)) {
    return { valid: false, message: "hasSidewalk must be true or false." };
  }
  for (const key of Object.keys(sceneLevel)) {
    if (!SCENE_KEYS.includes(key)) return { valid: false, message: `sceneLevel.${key} is not a question.` };
  }
  const required = requiredSceneKeys(hasSidewalk);
  const normalized = emptySceneLevel();
  for (const key of SCENE_KEYS) {
    const value = sceneLevel[key];
    if (!required.includes(key)) {
      if (isGiven(value)) return { valid: false, message: `sceneLevel.${key} is not asked when there is only a path.` };
      continue;
    }
    if (!SCENE_RULES[key](value)) return { valid: false, message: SCENE_MESSAGES[key] };
    normalized[key] = key in SCENE_NUMBERED ? asInteger(value) : value;
  }
  return { valid: true, sceneLevel: normalized };
}

/**
 * Contributors' boxes. hasSidewalk (S15, Step 1) picks the rules: with a
 * sidewalk (true, the default) every real box says whether it is on it
 * (S12). With only a path (false) Question 1 is never asked, so a real box
 * must have no onSidewalk at all. The obstructs and severity rules are the
 * same for both.
 */
export const PATH_HAS_NO_SIDEWALK_ANSWER = "With only a path, objects have no sidewalk answer.";

export function validateBoxes(selectedObjectsID, newObjects, { requireSeverity = true, hasSidewalk = true } = {}) {
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
    if (box.comment === NOT_AN_OBJECT && box.onSidewalk !== undefined) {
      return { valid: false, message: "A box marked as not an object has no sidewalk answer." };
    }
  }

  const allBoxes = [...selectedObjectsID, ...newObjects];
  for (const box of allBoxes) {
    // Contributors (S12, 2 Nov 2026): every real box says whether it is on the
    // sidewalk or the path people walk on. One that is not is stored as a
    // real object that does not obstruct, with no severity.
    if (box.comment !== NOT_AN_OBJECT && hasSidewalk === false) {
      if (box.onSidewalk !== undefined) return { valid: false, message: PATH_HAS_NO_SIDEWALK_ANSWER };
    } else if (box.comment !== NOT_AN_OBJECT) {
      if (typeof box.onSidewalk !== "boolean") {
        return { valid: false, message: "Every object must say whether it is on the sidewalk (onSidewalk: true/false)." };
      }
      if (box.onSidewalk === false && (box.obstructs !== false || box.severity != null)) {
        return { valid: false, message: "An object not on the sidewalk must have obstructs: false and no severity." };
      }
    }
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

// Annotators answer the obstruction question in their Obstructions step (from
// 4 Oct 2026), but give no severity and no scene answers. Real boxes keep the
// obstructs answer as sent (validateAnnotatorBoxes then requires a boolean),
// Not an object boxes carry obstructs: null, every box gets severity: null,
// and the incoming sceneLevel is discarded. The sidewalk outline (Sidewalk
// step, 6 Oct 2026) is returned unchanged: the route normalizes and checks it
// once it knows the image's size and whether the image needs one. Takes
// { sceneLevel, selectedObjectsID, newObjects, sidewalkMask }. The input is not
// mutated.
export function normalizeAnnotatorSubmission({ selectedObjectsID, newObjects, sidewalkMask }) {
  const clearJudgments = (boxes) =>
    Array.isArray(boxes)
      ? boxes.map((box) => ({
          ...box,
          obstructs: box?.comment === NOT_AN_OBJECT ? null : box?.obstructs,
          severity: null,
        }))
      : boxes;
  return {
    sceneLevel: null,
    selectedObjectsID: clearJudgments(selectedObjectsID),
    newObjects: clearJudgments(newObjects),
    sidewalkMask,
  };
}

const hasNumericMark = (box) =>
  box?.mark != null &&
  typeof box.mark === "object" &&
  ["x", "y", "width", "height"].every((k) => typeof box.mark[k] === "number" && Number.isFinite(box.mark[k]));

/**
 * The annotator's rules (4 Oct 2026). Objects step: every drawn box has one of
 * the 18 categories, every suggestion is kept with one of the 18 or marked not
 * an object, and every box has a numeric mark. No free-text "Other" category,
 * since an "other" box cannot train an 18-class detector (chapter_4.tex line
 * 59). Obstructions step: every real box (drawn or kept) has obstructs true or
 * false, the label the classifier is trained on (chapter_4.tex line 69).
 */
export function validateAnnotatorBoxes(selectedObjectsID, newObjects) {
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

  const realBoxes = [...newObjects, ...selectedObjectsID.filter((box) => box?.comment !== NOT_AN_OBJECT)];
  if (realBoxes.some((box) => typeof box.obstructs !== "boolean")) {
    return { valid: false, message: "Every object must have an obstruction answer (obstructs: true or false)." };
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

/*
 * The model's own values, from the image record (S5, 29 Oct 2026). The
 * detector's confidence and its category and box (initialState) feed the
 * analysis of trust and anchoring and the retraining rows, so they are taken
 * from the image record by id, never from the browser: a stale tab, a bug or
 * a crafted request could send anything (found 16 Oct 2026).
 *
 * The classifier's proposal (S3, 6 Nov 2026) is copied the same way. The
 * record's proposals change after each retraining cycle, so the stored
 * annotation is the only lasting record of what the contributor saw
 * (chapter_4.tex line 170).
 */

/** The fields of a proposal a request may not set: each comes from the record or is worked out here. */
const PROPOSAL_KEYS = ["proposedObstructs", "obstructionProbability", "proposalShown"];

function withoutProposal(box) {
  const out = { ...box };
  for (const key of PROPOSAL_KEYS) delete out[key];
  return out;
}

/** The record suggestion's proposal for initialState: each field only when the record has it. */
function recordProposal(entry) {
  return {
    ...(isProposal(entry?.proposedObstructs) ? { proposedObstructs: entry.proposedObstructs } : {}),
    ...(recordProbability(entry) !== null ? { obstructionProbability: recordProbability(entry) } : {}),
  };
}

/** A record suggestion's confidence, or null when it has none. */
function recordConfidence(entry) {
  return typeof entry?.confidence === "number" && Number.isFinite(entry.confidence) ? entry.confidence : null;
}

function recordById(annotationList) {
  return new Map((annotationList || []).map((entry) => [String(entry.id), entry]));
}

/**
 * Both roles: each submitted suggestion matched to the image record's entry
 * of the same id, with its confidence and initialState (the model's comment
 * and mark) replaced by the record's. Every entry of selectedObjectsID is a
 * suggestion, so editable is false. A suggestion with an id the record does
 * not have is refused. Gives { valid, message } or { valid, boxes }.
 *
 * S3: initialState also carries the record's `proposedObstructs` and
 * `obstructionProbability` when the record has them, and `proposalShown` is
 * true only when the record has a proposal and the box answered Question 1
 * Yes, or with only a path (S15) was not marked Not an object
 * (proposalWasShown). Any of the three sent in the request is dropped.
 * Annotators' boxes are always `proposalShown: false`.
 */
export function applyRecordSuggestions(selectedObjectsID, annotationList, { isAnnotator = false, hasSidewalk = true } = {}) {
  if (!Array.isArray(selectedObjectsID)) return { valid: true, boxes: selectedObjectsID };
  const byId = recordById(annotationList);
  const boxes = [];
  for (const box of selectedObjectsID) {
    const entry = box && byId.get(String(box.id));
    if (!entry) return { valid: false, message: "A suggested box does not belong to this image." };
    boxes.push({
      ...withoutProposal(box),
      editable: false,
      confidence: recordConfidence(entry),
      initialState: { comment: entry.comment ?? null, mark: entry.mark ? { ...entry.mark } : null, ...recordProposal(entry) },
      proposalShown: proposalWasShown(entry, box, { isAnnotator, hasSidewalk }),
    });
  }
  return { valid: true, boxes };
}

/** Both roles: drawn boxes have no confidence, no model state and no proposal, so none was shown. */
export function clearDrawnModelFields(newObjects) {
  if (!Array.isArray(newObjects)) return newObjects;
  return newObjects.map((box) => {
    if (!box || typeof box !== "object") return box;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
    const { initialState, ...rest } = withoutProposal(box);
    return { ...rest, confidence: null, proposalShown: false };
  });
}

/**
 * A copy of the telemetry with each suggestionConfidences entry's confidence,
 * the hidden ones' included, taken from the image record by id. An entry
 * whose id the record does not have is dropped. Other fields pass through.
 *
 * S3: each entry's `proposedObstructs` (the record's, or null) and
 * `proposalShown` are set the same way, `proposalShown` by the rule the
 * stored box follows, read against `boxes`, the submitted suggestions of the
 * same ids. An entry with no submitted box (one hidden below tau) was never
 * shown. A tampered body cannot change either.
 */
export function withRecordConfidences(telemetry, annotationList, { boxes = [], isAnnotator = false, hasSidewalk = true } = {}) {
  if (!telemetry || typeof telemetry !== "object" || !Array.isArray(telemetry.suggestionConfidences)) return telemetry;
  const byId = recordById(annotationList);
  const submitted = new Map((Array.isArray(boxes) ? boxes : []).filter(Boolean).map((box) => [String(box.id), box]));
  const suggestionConfidences = [];
  for (const entry of telemetry.suggestionConfidences) {
    const record = entry && typeof entry === "object" ? byId.get(String(entry.id)) : undefined;
    if (!record) continue;
    suggestionConfidences.push({
      ...entry,
      confidence: recordConfidence(record),
      proposedObstructs: isProposal(record.proposedObstructs) ? record.proposedObstructs : null,
      proposalShown: proposalWasShown(record, submitted.get(String(entry.id)), { isAnnotator, hasSidewalk }),
    });
  }
  return { ...telemetry, suggestionConfidences };
}
