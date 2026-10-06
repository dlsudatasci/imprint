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

// askSeverity is false for annotators, who record no severity (decided 3 Oct 2026).
export function getSuggestionPanelMode({ editable, selected, obstructs, severity, comment, askSeverity = true }) {
  if (askSeverity && !editable && selected && obstructs === true && severity == null) return "severity";
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
