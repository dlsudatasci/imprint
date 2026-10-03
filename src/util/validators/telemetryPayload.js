import { isNotAnObject } from "@/util/suggestionJudgment";

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

function buildSuggestionConfidences(annotations) {
  const result = [];
  for (const obj of annotations) {
    if (obj.editable) continue;

    let action;
    if (obj.isRejected) {
      action = isNotAnObject(obj) ? "not_an_object" : "deleted";
    } else if (obj.selected) {
      const init = obj.initialState;
      let isModified = false;
      if (init) {
        const normalizedInit = init.comment ? init.comment.toLowerCase().replace(/_/g, " ") : "";
        const normalizedObj = obj.comment ? obj.comment.toLowerCase().replace(/_/g, " ") : "";
        if (normalizedInit !== normalizedObj) isModified = true;
        if (
          Math.abs(init.mark.x - obj.mark.x) > GEOMETRY_TOLERANCE_PX ||
          Math.abs(init.mark.y - obj.mark.y) > GEOMETRY_TOLERANCE_PX ||
          Math.abs(init.mark.width - obj.mark.width) > GEOMETRY_TOLERANCE_PX ||
          Math.abs(init.mark.height - obj.mark.height) > GEOMETRY_TOLERANCE_PX
        ) {
          isModified = true;
        }
      }
      action = isModified ? "modified" : "accepted";
    } else {
      continue;
    }

    result.push({
      id: obj.id,
      confidence: obj.confidence ?? null,
      action,
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

function buildSubmissionCounts(annotations) {
  let manualBoxCount = 0;
  let acceptedSuggestionCount = 0;
  let modifiedSuggestionCount = 0;
  let deletedSuggestionCount = 0;
  let notAnObjectSuggestionCount = 0;
  let obstructionCount = 0;
  let nonObstructionCount = 0;

  for (const obj of annotations) {
    if (obj.editable) {
      manualBoxCount++;
      if (obj.obstructs === true) obstructionCount++;
      else if (obj.obstructs === false) nonObstructionCount++;
    } else if (obj.isRejected) {
      if (isNotAnObject(obj)) {
        notAnObjectSuggestionCount++;
      } else {
        deletedSuggestionCount++;
        if (obj.obstructs === false) nonObstructionCount++;
      }
    } else if (obj.selected) {
      const init = obj.initialState;
      let isModified = false;
      if (init) {
        const normalizedInit = init.comment ? init.comment.toLowerCase().replace(/_/g, " ") : "";
        const normalizedObj = obj.comment ? obj.comment.toLowerCase().replace(/_/g, " ") : "";
        if (normalizedInit !== normalizedObj) isModified = true;
        if (
          Math.abs(init.mark.x - obj.mark.x) > GEOMETRY_TOLERANCE_PX ||
          Math.abs(init.mark.y - obj.mark.y) > GEOMETRY_TOLERANCE_PX ||
          Math.abs(init.mark.width - obj.mark.width) > GEOMETRY_TOLERANCE_PX ||
          Math.abs(init.mark.height - obj.mark.height) > GEOMETRY_TOLERANCE_PX
        ) {
          isModified = true;
        }
      }
      if (isModified) {
        modifiedSuggestionCount++;
      } else {
        acceptedSuggestionCount++;
      }
      if (obj.obstructs === true) obstructionCount++;
      else if (obj.obstructs === false) nonObstructionCount++;
    }
  }

  return {
    manualBoxCount,
    acceptedSuggestionCount,
    modifiedSuggestionCount,
    deletedSuggestionCount,
    notAnObjectSuggestionCount,
    obstructionCount,
    nonObstructionCount,
  };
}

export {
  GEOMETRY_TOLERANCE_PX,
  TAU_THRESHOLD,
  filterAnnotationsByTau,
  computeStepTimings,
  buildSuggestionConfidences,
  buildGeometryChanges,
  buildLabelChanges,
  buildSubmissionCounts,
};
