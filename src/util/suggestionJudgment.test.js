import { describe, it, expect } from "vitest";
import { isTaxonomyCategory } from "./taxonomy";
import {
  NOT_AN_OBJECT,
  isNotAnObject,
  notAnObjectPatch,
  excludeNotAnObject,
  getSuggestionPanelMode,
  keepObjectPatch,
  annotatorNotAnObjectPatch,
  getObjectPanelMode,
  isDecidedForObjects,
} from "./suggestionJudgment";

describe("NOT_AN_OBJECT", () => {
  it("equals 'not_an_object'", () => {
    expect(NOT_AN_OBJECT).toBe("not_an_object");
  });

  it("is not a taxonomy category", () => {
    expect(isTaxonomyCategory(NOT_AN_OBJECT)).toBe(false);
  });
});

describe("isNotAnObject", () => {
  it("returns true for a box with that comment", () => {
    expect(isNotAnObject({ comment: "not_an_object" })).toBe(true);
  });

  it("returns false for a taxonomy label", () => {
    expect(isNotAnObject({ comment: "tree" })).toBe(false);
  });

  it("returns false for an empty comment", () => {
    expect(isNotAnObject({ comment: "" })).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isNotAnObject(undefined)).toBe(false);
  });
});

describe("notAnObjectPatch", () => {
  it("returns exactly the five fields", () => {
    expect(notAnObjectPatch()).toEqual({
      comment: "not_an_object",
      selected: false,
      isRejected: true,
      obstructs: false,
      severity: null,
    });
  });
});

describe("excludeNotAnObject", () => {
  it("removes only not-an-object boxes and keeps order", () => {
    const boxes = [
      { id: "a", comment: "tree" },
      { id: "b", comment: "not_an_object" },
      { id: "c", comment: "bollard" },
    ];
    const result = excludeNotAnObject(boxes);
    expect(result).toEqual([
      { id: "a", comment: "tree" },
      { id: "c", comment: "bollard" },
    ]);
  });

  it("returns [] for undefined", () => {
    expect(excludeNotAnObject(undefined)).toEqual([]);
  });

  it("returns [] for empty array", () => {
    expect(excludeNotAnObject([])).toEqual([]);
  });
});

describe("getSuggestionPanelMode", () => {
  it("returns 'drawn' for a user-drawn box", () => {
    expect(getSuggestionPanelMode({ editable: true, selected: false, obstructs: undefined, severity: undefined, comment: "tree" })).toBe("drawn");
  });

  it("returns 'severity' for confirmed suggestion with obstructs true and no severity", () => {
    expect(getSuggestionPanelMode({ editable: false, selected: true, obstructs: true, severity: null, comment: "tree" })).toBe("severity");
  });

  it("returns 'confirmed' for confirmed suggestion with a severity", () => {
    expect(getSuggestionPanelMode({ editable: false, selected: true, obstructs: true, severity: 3, comment: "tree" })).toBe("confirmed");
  });

  it("returns 'judge' for untouched suggestion", () => {
    expect(getSuggestionPanelMode({ editable: false, selected: false, obstructs: undefined, severity: undefined, comment: "tree" })).toBe("judge");
  });

  it("returns 'judge' for suggestion answered No with taxonomy label", () => {
    expect(getSuggestionPanelMode({ editable: false, selected: false, obstructs: false, severity: null, comment: "tree" })).toBe("judge");
  });

  it("returns 'not_an_object' for suggestion with not_an_object comment", () => {
    expect(getSuggestionPanelMode({ editable: false, selected: false, obstructs: false, severity: null, comment: "not_an_object" })).toBe("not_an_object");
  });

  it("never returns 'severity' for annotators: a suggestion answered Yes with no severity is 'confirmed' (3 Oct 2026)", () => {
    const yesNoSeverity = { editable: false, selected: true, obstructs: true, severity: null, comment: "tree" };
    expect(getSuggestionPanelMode({ ...yesNoSeverity, askSeverity: false })).toBe("confirmed");
    expect(getSuggestionPanelMode({ ...yesNoSeverity, severity: undefined, askSeverity: false })).toBe("confirmed");
  });

  it("still returns 'severity' by default and with askSeverity true", () => {
    const yesNoSeverity = { editable: false, selected: true, obstructs: true, severity: null, comment: "tree" };
    expect(getSuggestionPanelMode(yesNoSeverity)).toBe("severity");
    expect(getSuggestionPanelMode({ ...yesNoSeverity, askSeverity: true })).toBe("severity");
  });

  it("leaves every other mode unchanged for annotators", () => {
    expect(getSuggestionPanelMode({ editable: true, selected: false, obstructs: undefined, severity: undefined, comment: "tree", askSeverity: false })).toBe("drawn");
    expect(getSuggestionPanelMode({ editable: false, selected: false, obstructs: undefined, severity: undefined, comment: "tree", askSeverity: false })).toBe("judge");
    expect(getSuggestionPanelMode({ editable: false, selected: false, obstructs: false, severity: null, comment: "not_an_object", askSeverity: false })).toBe("not_an_object");
  });
});

// Annotators, Step 1 Objects (4 Oct 2026)
describe("keepObjectPatch", () => {
  it("keeps the suggestion with no obstruction answer", () => {
    expect(keepObjectPatch()).toEqual({ selected: true, isRejected: false, obstructs: null, severity: null });
  });
});

describe("annotatorNotAnObjectPatch", () => {
  it("marks Not an object with obstructs null", () => {
    expect(annotatorNotAnObjectPatch()).toEqual({
      comment: "not_an_object",
      selected: false,
      isRejected: true,
      obstructs: null,
      severity: null,
    });
  });

  it("leaves the contributor patch unchanged (obstructs false)", () => {
    expect(notAnObjectPatch().obstructs).toBe(false);
  });
});

describe("getObjectPanelMode", () => {
  it("returns 'drawn' for a drawn box", () => {
    expect(getObjectPanelMode({ editable: true, selected: false, comment: "tree" })).toBe("drawn");
  });

  it("returns 'kept' for a kept suggestion", () => {
    expect(getObjectPanelMode({ editable: false, selected: true, comment: "tree" })).toBe("kept");
  });

  it("returns 'not_an_object' for a suggestion marked Not an object", () => {
    expect(getObjectPanelMode({ editable: false, selected: false, comment: "not_an_object" })).toBe("not_an_object");
  });

  it("returns 'decide' for an untouched suggestion or one whose category was changed back", () => {
    expect(getObjectPanelMode({ editable: false, selected: false, comment: "tree" })).toBe("decide");
    expect(getObjectPanelMode({ editable: false, selected: false, comment: "" })).toBe("decide");
  });
});

describe("isDecidedForObjects", () => {
  it("is true for a drawn box, a kept suggestion and a Not an object suggestion", () => {
    expect(isDecidedForObjects({ editable: true, comment: "tree" })).toBe(true);
    expect(isDecidedForObjects({ editable: false, selected: true, comment: "tree" })).toBe(true);
    expect(isDecidedForObjects({ editable: false, selected: false, isRejected: true, comment: "not_an_object" })).toBe(true);
  });

  it("is false for an untouched suggestion", () => {
    expect(isDecidedForObjects({ editable: false, selected: false, comment: "tree" })).toBe(false);
  });

  it("is false for an old No answer (rejected with a taxonomy category)", () => {
    expect(isDecidedForObjects({ editable: false, selected: false, isRejected: true, comment: "tree" })).toBe(false);
  });

  it("is false for a missing box", () => {
    expect(isDecidedForObjects(undefined)).toBe(false);
  });
});
