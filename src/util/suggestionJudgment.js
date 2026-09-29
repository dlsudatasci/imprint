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

export function getSuggestionPanelMode({ editable, selected, obstructs, severity, comment }) {
  if (!editable && selected && obstructs === true && severity == null) return "severity";
  if (editable) return "drawn";
  if (selected) return "confirmed";
  if (comment === NOT_AN_OBJECT) return "not_an_object";
  return "judge";
}
