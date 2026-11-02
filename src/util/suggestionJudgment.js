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

/** Go back to the sidewalk question: the box is undecided again. */
export function clearSidewalkPatch({ editable }) {
  return { ...onSidewalkPatch({ editable }), onSidewalk: undefined };
}

// askSeverity is false for annotators, who record no severity (decided 3 Oct 2026).
// From 7 Oct 2026 a drawn box answered Yes goes to the same severity picker as
// a suggestion, instead of a slider inside its panel.
// askOnSidewalk (S12, 2 Nov 2026): until a box is answered on the sidewalk, its
// panel shows the sidewalk question ("sidewalk"), and only then the obstruction
// question. Not an object boxes are never asked it.
export function getSuggestionPanelMode({ editable, selected, obstructs, severity, comment, onSidewalk, askSeverity = true, askOnSidewalk = true }) {
  if (askOnSidewalk && comment !== NOT_AN_OBJECT && onSidewalk !== true) return "sidewalk";
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
