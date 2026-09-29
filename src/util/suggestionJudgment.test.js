import { describe, it, expect } from "vitest";
import { isTaxonomyCategory } from "./taxonomy";
import {
  NOT_AN_OBJECT,
  isNotAnObject,
  notAnObjectPatch,
  excludeNotAnObject,
  getSuggestionPanelMode,
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
});
