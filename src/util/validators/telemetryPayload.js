import { isNotAnObject } from "@/util/suggestionJudgment";
import { isTaxonomyCategory } from "@/util/taxonomy";

const GEOMETRY_TOLERANCE_PX = 3;
const TAU_THRESHOLD = 0.5;

function filterAnnotationsByTau(annotations, tau) {
  const visible = [];
  const hidden = [];
  for (const ann of annotations) {
    if (ann.editable) {
      visible.push(ann);
    } else if (typeof ann.confidence === "number" && ann.confidence < tau) {
      hidden.push(ann);
    } else {
      visible.push(ann);
    }
  }
  return { visible, hidden };
}

// Annotators have no scene step (decided 3 Oct 2026). Their scene time is
// null rather than 0, so it does not read as a measured zero.
function computeStepTimings(mountTime, sceneStepStartMs, submitTime, { hasSceneStep = true } = {}) {
  if (!hasSceneStep) {
    return { msObjectStep: submitTime - mountTime, msSceneStep: null };
  }
  const sceneStart = sceneStepStartMs ?? submitTime;
  return {
    msObjectStep: sceneStart - mountTime,
    msSceneStep: submitTime - sceneStart,
  };
}

// Annotators (4 and 6 Oct 2026): Objects, then Sidewalk (model-development
// images only), then Obstructions. Each start time is the last time the
// annotator entered that step, and the tool clears the start times of later
// steps whenever an earlier step is entered, so mount <= sidewalk start <=
// obstruction start <= submit. Time spent in a later step before going back
// counts toward the earlier one. msSceneStep is null, since annotators have no
// scene step.
function computeAnnotatorStepTimings(mountTime, obstructionStepStartMs, submitTime, { sidewalkStepStartMs = null } = {}) {
  return {
    msObjectStep: (sidewalkStepStartMs ?? obstructionStepStartMs ?? submitTime) - mountTime,
    msSidewalkStep: sidewalkStepStartMs == null ? null : (obstructionStepStartMs ?? submitTime) - sidewalkStepStartMs,
    msObstructionStep: obstructionStepStartMs == null ? null : submitTime - obstructionStepStartMs,
    msSceneStep: null,
  };
}

// Two of the quality checks fixed on 21 Oct 2026 (S10, imprint-model-training
// pipeline_methodology.md section 7af, chapter_4.tex line 300): an image idle
// for more than 10 minutes then submitted under 5 seconds after work resumed,
// and a session where every suggestion was confirmed at a mean under 1 second.
// imprint-model-training computes the flags from the exported logs. The tool
// only records the times, for contributors only (annotators are not screened).
const IDLE_FLAG_MS = 10 * 60 * 1000;

/**
 * The gaps between interactions on one image, from mount to submit. note() is
 * called on every pointer, key or touch event while the image is open. Times
 * default to Date.now(), so fake timers drive it in tests.
 *
 * summarize() gives msLongestIdle, the longest gap (mount and submit count as
 * its ends), and msFromLastIdleToSubmit, the time from the interaction that
 * ended that gap to submit when the gap was over 10 minutes, else null.
 */
function createIdleClock(startMs = Date.now()) {
  let last = startMs;
  let longest = 0;
  let longestEnd = startMs;
  return {
    note(at = Date.now()) {
      if (at < last) return;
      if (at - last > longest) {
        longest = at - last;
        longestEnd = at;
      }
      last = at;
    },
    summarize(submitMs = Date.now()) {
      let gap = longest;
      let end = longestEnd;
      if (submitMs - last > gap) {
        gap = submitMs - last;
        end = submitMs;
      }
      return {
        msLongestIdle: gap,
        msFromLastIdleToSubmit: gap > IDLE_FLAG_MS ? submitMs - end : null,
      };
    },
  };
}

/**
 * When each suggestion was first shown with the photo and first answered
 * (Yes, No or Not an object) on one image. Later answers and Go back do not
 * move either time. A suggestion already answered when it is first shown (its
 * answer restored after a refresh) is marked unknown: its time to answer
 * cannot be known, so it stays null.
 */
function createAnswerClock() {
  const shownAt = new Map();
  const answeredAt = new Map();
  return {
    shown(id, at = Date.now()) {
      if (!shownAt.has(id)) shownAt.set(id, at);
    },
    answered(id, at = Date.now()) {
      if (shownAt.has(id) && !answeredAt.has(id)) answeredAt.set(id, at);
    },
    unknown(id) {
      if (!answeredAt.has(id)) answeredAt.set(id, null);
    },
    msToAnswer(id) {
      const answered = answeredAt.get(id);
      const shown = shownAt.get(id);
      return answered == null || shown == null ? null : answered - shown;
    },
  };
}

/**
 * What was done to an answered suggestion, in the manuscript's names
 * (chapter_4.tex lines 170 and 184, S6, 29 Oct 2026). The obstruction answer
 * is not part of it: a No is an answer about an object, not a removal.
 *   - removed: marked Not an object, a false detection
 *   - accepted: kept with the same category and the box within the 3 px tolerance
 *   - relabeled: the category changed to another of the 18
 *   - custom_category: the category changed to free text
 *   - modified: the box moved or resized beyond the tolerance
 *   - relabeled_and_modified, custom_category_and_modified: both changes
 * Categories are compared without case, with spaces and underscores alike.
 */
const SUGGESTION_DISPOSITIONS = Object.freeze([
  "removed",
  "accepted",
  "relabeled",
  "custom_category",
  "modified",
  "relabeled_and_modified",
  "custom_category_and_modified",
]);

function categoryKey(comment) {
  return typeof comment === "string" ? comment.trim().toLowerCase().replace(/[\s_]+/g, "_") : "";
}

function suggestionDisposition(obj) {
  if (isNotAnObject(obj)) return "removed";
  const init = obj.initialState;
  if (!init) return "accepted";
  const category = categoryKey(obj.comment);
  const categoryChanged = categoryKey(init.comment) !== category;
  const boxChanged =
    Math.abs(init.mark.x - obj.mark.x) > GEOMETRY_TOLERANCE_PX ||
    Math.abs(init.mark.y - obj.mark.y) > GEOMETRY_TOLERANCE_PX ||
    Math.abs(init.mark.width - obj.mark.width) > GEOMETRY_TOLERANCE_PX ||
    Math.abs(init.mark.height - obj.mark.height) > GEOMETRY_TOLERANCE_PX;
  if (!categoryChanged) return boxChanged ? "modified" : "accepted";
  const label = isTaxonomyCategory(category) ? "relabeled" : "custom_category";
  return boxChanged ? `${label}_and_modified` : label;
}

/**
 * One entry per answered suggestion: its id, the model's confidence, its
 * disposition and the obstruction answer (true, false, or null when none was
 * given). Unanswered suggestions and drawn boxes are left out, and drawn boxes
 * keep their own counts. disposition and obstructs replaced the single action
 * label (S6, 29 Oct 2026), which called a contributor's No "deleted".
 *
 * msToAnswer (contributors, S10): a function from a suggestion's id to its
 * time to answer. Left out for annotators, whose entries carry no msToAnswer.
 */
function buildSuggestionConfidences(annotations, { msToAnswer } = {}) {
  const result = [];
  for (const obj of annotations) {
    if (obj.editable) continue;
    if (!obj.isRejected && !obj.selected) continue;

    result.push({
      id: obj.id,
      confidence: obj.confidence ?? null,
      disposition: suggestionDisposition(obj),
      obstructs: typeof obj.obstructs === "boolean" ? obj.obstructs : null,
      ...(typeof msToAnswer === "function" ? { msToAnswer: msToAnswer(obj.id) } : {}),
    });
  }
  return result;
}

function buildGeometryChanges(annotations) {
  const result = [];
  for (const obj of annotations) {
    if (obj.editable || obj.isRejected || !obj.selected) continue;
    const init = obj.initialState;
    if (!init) continue;

    const dx = Math.abs(init.mark.x - obj.mark.x);
    const dy = Math.abs(init.mark.y - obj.mark.y);
    const dw = Math.abs(init.mark.width - obj.mark.width);
    const dh = Math.abs(init.mark.height - obj.mark.height);
    const deltaPx = Math.max(dx, dy, dw, dh);

    if (deltaPx > GEOMETRY_TOLERANCE_PX) {
      result.push({
        id: obj.id,
        originalBox: { x: init.mark.x, y: init.mark.y, w: init.mark.width, h: init.mark.height },
        finalBox: { x: obj.mark.x, y: obj.mark.y, w: obj.mark.width, h: obj.mark.height },
        deltaPx,
      });
    }
  }
  return result;
}

function buildLabelChanges(annotations) {
  const result = [];
  for (const obj of annotations) {
    if (obj.editable) continue;
    if (isNotAnObject(obj)) continue;
    if (!obj.selected && !obj.isRejected) continue;
    const init = obj.initialState;
    if (!init) continue;

    const normalizedInit = init.comment ? init.comment.toLowerCase().replace(/_/g, " ") : "";
    const normalizedObj = obj.comment ? obj.comment.toLowerCase().replace(/_/g, " ") : "";

    if (normalizedInit !== normalizedObj) {
      result.push({
        id: obj.id,
        originalLabel: init.comment || "",
        finalLabel: obj.comment || "",
      });
    }
  }
  return result;
}

// The count each disposition goes to, in SUGGESTION_DISPOSITIONS order
const DISPOSITION_COUNT_FIELDS = Object.freeze({
  removed: "removedSuggestionCount",
  accepted: "acceptedSuggestionCount",
  relabeled: "relabeledSuggestionCount",
  custom_category: "customCategorySuggestionCount",
  modified: "modifiedSuggestionCount",
  relabeled_and_modified: "relabeledAndModifiedSuggestionCount",
  custom_category_and_modified: "customCategoryAndModifiedSuggestionCount",
});

/**
 * The image's counts. Every answered suggestion is counted once, under the
 * disposition its suggestionConfidences entry gets (suggestionDisposition), so
 * the counts and the entries never disagree (S6, 29 Oct 2026). A No counts
 * under its disposition, usually accepted, and Not an object under removed.
 *
 * totalBoxesSubmitted counts every real object: drawn boxes and every answered
 * suggestion that is not Not an object, Yes or No alike. obstructionCount and
 * nonObstructionCount follow obstructs on those objects.
 */
function buildSubmissionCounts(annotations) {
  const counts = { manualBoxCount: 0 };
  for (const field of Object.values(DISPOSITION_COUNT_FIELDS)) counts[field] = 0;
  let realSuggestionCount = 0;
  let obstructionCount = 0;
  let nonObstructionCount = 0;

  for (const obj of annotations) {
    if (obj.editable) {
      counts.manualBoxCount++;
      if (obj.obstructs === true) obstructionCount++;
      else if (obj.obstructs === false) nonObstructionCount++;
      continue;
    }
    if (!obj.isRejected && !obj.selected) continue;
    const disposition = suggestionDisposition(obj);
    counts[DISPOSITION_COUNT_FIELDS[disposition]]++;
    if (disposition === "removed") continue;

    realSuggestionCount++;
    // A No is isRejected with obstructs false, so a true there is not an answer
    if (obj.obstructs === true && !obj.isRejected) obstructionCount++;
    else if (obj.obstructs === false) nonObstructionCount++;
  }

  return {
    ...counts,
    totalBoxesSubmitted: counts.manualBoxCount + realSuggestionCount,
    obstructionCount,
    nonObstructionCount,
  };
}

export {
  GEOMETRY_TOLERANCE_PX,
  TAU_THRESHOLD,
  IDLE_FLAG_MS,
  SUGGESTION_DISPOSITIONS,
  DISPOSITION_COUNT_FIELDS,
  filterAnnotationsByTau,
  createIdleClock,
  createAnswerClock,
  computeStepTimings,
  computeAnnotatorStepTimings,
  buildSuggestionConfidences,
  buildGeometryChanges,
  buildLabelChanges,
  buildSubmissionCounts,
};
