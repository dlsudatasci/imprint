export const NOT_AN_OBJECT = "not_an_object";

export function isNotAnObject(box) {
  return box?.comment === NOT_AN_OBJECT;
}

export function notAnObjectPatch() {
  return { comment: NOT_AN_OBJECT, selected: false, isRejected: true, obstructs: false, severity: null };
}

export function excludeNotAnObject(boxes) {
  if (!boxes) return [];
  return boxes.filter((box) => !isNotAnObject(box));
}

/**
 * Contributors (S12, 2 Nov 2026): whether the object is on the sidewalk or the
 * path people walk on is asked before whether it obstructs. A box answered No
 * leaves the photo, is listed under Not obstructions and is stored as a
 * real object that does not obstruct, a negative example for the classifier.
 * It is never Not an object and never removed. Not an object boxes carry no
 * onSidewalk.
 */
export function isOffSidewalk(box) {
  return box?.onSidewalk === false && !isNotAnObject(box);
}

/**
 * Contributors: a box that leaves the photo once its panel closes, listed in
 * the answers, where its name opens it again. A box off the sidewalk (S12),
 * and from S17 (4 Nov 2026) a suggestion marked Not an object, like an off
 * the path box. A drawn box is never Not an object.
 */
export function isSetAside(box) {
  return isOffSidewalk(box) || (box?.editable !== true && isNotAnObject(box));
}

/** No to the sidewalk question. Suggestions get today's No as well. */
export function offSidewalkPatch({ editable }) {
  const patch = { onSidewalk: false, obstructs: false, severity: null };
  return editable ? patch : { ...patch, selected: false, isRejected: true };
}

/** Yes to the sidewalk question: on the path, the obstruction question still to answer. */
export function onSidewalkPatch({ editable }) {
  const patch = { onSidewalk: true, obstructs: undefined, severity: null };
  return editable ? patch : { ...patch, selected: false, isRejected: false };
}

// askSeverity is false for annotators, who record no severity (decided 3 Oct 2026).
// From 7 Oct 2026 a drawn box answered Yes goes to the same severity picker as
// a suggestion, instead of a slider inside its panel.
// askOnSidewalk (S12, 2 Nov 2026): until a box is answered on the sidewalk, its
// panel shows the sidewalk question ("sidewalk"), and only then the obstruction
// question. Not an object boxes are never asked it.
// pathOnly (S15, 9 Nov 2026): Step 1 says there is only a path, so there is
// no sidewalk to be on and the panel goes straight to the obstruction question.
export function getSuggestionPanelMode({ editable, selected, obstructs, severity, comment, onSidewalk, askSeverity = true, askOnSidewalk = true, pathOnly = false }) {
  if (askOnSidewalk && !pathOnly && comment !== NOT_AN_OBJECT && onSidewalk !== true) return "sidewalk";
  if (askSeverity && obstructs === true && severity == null && (editable || selected)) return "severity";
  if (editable) return "drawn";
  if (selected) return "confirmed";
  if (comment === NOT_AN_OBJECT) return "not_an_object";
  return "judge";
}

// Annotators, Step 1 Objects (4 Oct 2026): boxes and categories only. A kept
// suggestion means "verified real object", not "obstructs". Obstruction answers
// come in a later annotator step, so every box carries obstructs: null.
export function keepObjectPatch() {
  return { selected: true, isRejected: false, obstructs: null, severity: null };
}

export function annotatorNotAnObjectPatch() {
  return { ...notAnObjectPatch(), obstructs: null };
}

export function getObjectPanelMode({ editable, selected, comment }) {
  if (editable) return "drawn";
  if (selected) return "kept";
  if (comment === NOT_AN_OBJECT) return "not_an_object";
  return "decide";
}

// A rejected suggestion with any other comment (an old "No", or a Not an
// object box whose category was changed back) is not decided: the annotator
// must click Keep.
export function isDecidedForObjects(box) {
  if (!box) return false;
  if (box.editable) return true;
  return box.selected === true || box.comment === NOT_AN_OBJECT;
}

/**
 * Contributors' Step 1 changed after boxes were answered (S15, 9 Nov 2026).
 * `from` and `to` are hasSidewalk before and after: true a sidewalk, false
 * only a path, null not answered.
 *
 * Yes to No: a box answered not on the path (onSidewalk false) goes back to
 * Still to decide, its onSidewalk, obstructs and severity removed, and a
 * suggestion also loses the isRejected that offSidewalkPatch set. A box
 * answered on the path keeps its obstructs and severity and loses onSidewalk,
 * since a path box has none.
 *
 * No to Yes: every real box goes back to Still to decide with obstructs and
 * severity removed, and a suggestion also loses selected and isRejected,
 * since Question 1 must now be asked first.
 *
 * Not an object and every category are kept either way. Returns new boxes
 * (the input is not mutated) and `resetIds`, the boxes that need answering
 * again, which decide whether "Some boxes need answering again." shows.
 *
 * @param {Array<object> | null | undefined} boxes
 * @param {boolean | null} from
 * @param {boolean | null} to
 * @returns {{ boxes: Array<object>, resetIds: string[] }}
 */
export function applyPresenceChange(boxes, from, to) {
  const list = Array.isArray(boxes) ? boxes : [];
  const resetIds = [];
  const changing = (from === true && to === false) || (from === false && to === true);
  const next = list.map((box) => {
    if (!changing || !box || typeof box !== "object" || isNotAnObject(box)) return box;
    const suggestion = box.editable !== true;
    const copy = { ...box };
    if (to === false) {
      if (box.onSidewalk === false) {
        delete copy.onSidewalk;
        delete copy.obstructs;
        delete copy.severity;
        if (suggestion) delete copy.isRejected;
        resetIds.push(box.id);
      } else if ("onSidewalk" in copy) {
        delete copy.onSidewalk;
      } else {
        return box;
      }
      return copy;
    }
    const hadAnswer = typeof box.obstructs === "boolean" || box.severity != null || (suggestion && (box.selected === true || box.isRejected === true));
    if (!hadAnswer) return box;
    delete copy.obstructs;
    delete copy.severity;
    if (suggestion) {
      delete copy.selected;
      delete copy.isRejected;
    }
    resetIds.push(box.id);
    return copy;
  });
  return { boxes: next, resetIds };
}
