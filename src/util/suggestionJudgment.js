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
