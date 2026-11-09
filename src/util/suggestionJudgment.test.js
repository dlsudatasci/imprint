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
  isOffSidewalk,
  offSidewalkPatch,
  onSidewalkPatch,
  applyPresenceChange,
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
    expect(getSuggestionPanelMode({ editable: true, selected: false, obstructs: undefined, severity: undefined, comment: "tree", onSidewalk: true })).toBe("drawn");
  });

  it("returns 'severity' for confirmed suggestion with obstructs true and no severity", () => {
    expect(getSuggestionPanelMode({ editable: false, selected: true, obstructs: true, severity: null, comment: "tree", onSidewalk: true })).toBe("severity");
  });

  it("returns 'confirmed' for confirmed suggestion with a severity", () => {
    expect(getSuggestionPanelMode({ editable: false, selected: true, obstructs: true, severity: 3, comment: "tree", onSidewalk: true })).toBe("confirmed");
  });

  it("returns 'judge' for untouched suggestion", () => {
    expect(getSuggestionPanelMode({ editable: false, selected: false, obstructs: undefined, severity: undefined, comment: "tree", onSidewalk: true })).toBe("judge");
  });

  it("returns 'judge' for suggestion answered No with taxonomy label", () => {
    expect(getSuggestionPanelMode({ editable: false, selected: false, obstructs: false, severity: null, comment: "tree", onSidewalk: true })).toBe("judge");
  });

  it("returns 'not_an_object' for suggestion with not_an_object comment", () => {
    expect(getSuggestionPanelMode({ editable: false, selected: false, obstructs: false, severity: null, comment: "not_an_object" })).toBe("not_an_object");
  });

  it("never returns 'severity' for annotators: a suggestion answered Yes with no severity is 'confirmed' (3 Oct 2026)", () => {
    const yesNoSeverity = { editable: false, selected: true, obstructs: true, severity: null, comment: "tree", onSidewalk: true };
    expect(getSuggestionPanelMode({ ...yesNoSeverity, askSeverity: false })).toBe("confirmed");
    expect(getSuggestionPanelMode({ ...yesNoSeverity, severity: undefined, askSeverity: false })).toBe("confirmed");
  });

  it("still returns 'severity' by default and with askSeverity true", () => {
    const yesNoSeverity = { editable: false, selected: true, obstructs: true, severity: null, comment: "tree", onSidewalk: true };
    expect(getSuggestionPanelMode(yesNoSeverity)).toBe("severity");
    expect(getSuggestionPanelMode({ ...yesNoSeverity, askSeverity: true })).toBe("severity");
  });

  it("sends a drawn box answered Yes with no severity to the severity picker, like a suggestion (7 Oct 2026)", () => {
    expect(getSuggestionPanelMode({ editable: true, selected: false, obstructs: true, severity: null, comment: "bollard", onSidewalk: true })).toBe("severity");
    expect(getSuggestionPanelMode({ editable: true, selected: false, obstructs: true, severity: undefined, comment: "bollard", onSidewalk: true })).toBe("severity");
    // Rated, answered No, or not yet answered: the drawn panel
    expect(getSuggestionPanelMode({ editable: true, selected: false, obstructs: true, severity: 2, comment: "bollard", onSidewalk: true })).toBe("drawn");
    expect(getSuggestionPanelMode({ editable: true, selected: false, obstructs: false, severity: null, comment: "bollard", onSidewalk: true })).toBe("drawn");
    expect(getSuggestionPanelMode({ editable: true, selected: false, obstructs: null, severity: null, comment: "bollard", onSidewalk: true })).toBe("drawn");
    // Never for annotators
    expect(getSuggestionPanelMode({ editable: true, selected: false, obstructs: true, severity: null, comment: "bollard", onSidewalk: true, askSeverity: false })).toBe("drawn");
  });

  it("leaves every other mode unchanged for annotators", () => {
    expect(getSuggestionPanelMode({ editable: true, selected: false, obstructs: undefined, severity: undefined, comment: "tree", onSidewalk: true, askSeverity: false })).toBe("drawn");
    expect(getSuggestionPanelMode({ editable: false, selected: false, obstructs: undefined, severity: undefined, comment: "tree", onSidewalk: true, askSeverity: false })).toBe("judge");
    expect(getSuggestionPanelMode({ editable: false, selected: false, obstructs: false, severity: null, comment: "not_an_object", askSeverity: false })).toBe("not_an_object");
  });
});

// S12 (2 Nov 2026): whether the object is on the sidewalk or the path people
// walk on comes first
describe("getSuggestionPanelMode, the sidewalk question", () => {
  const untouched = { editable: false, selected: false, obstructs: undefined, severity: undefined, comment: "tree" };
  const newDrawn = { editable: true, selected: false, obstructs: undefined, severity: undefined, comment: "bollard" };

  it("asks it first of a suggestion or a drawn box with no sidewalk answer", () => {
    expect(getSuggestionPanelMode(untouched)).toBe("sidewalk");
    expect(getSuggestionPanelMode({ ...untouched, onSidewalk: null })).toBe("sidewalk");
    expect(getSuggestionPanelMode(newDrawn)).toBe("sidewalk");
    // A drawn box still picks its category first, in the same panel
    expect(getSuggestionPanelMode({ ...newDrawn, comment: "---" })).toBe("sidewalk");
  });

  it("asks it again of a box answered not on the sidewalk, so the answer can be changed", () => {
    expect(getSuggestionPanelMode({ ...untouched, onSidewalk: false, obstructs: false, severity: null, isRejected: true })).toBe("sidewalk");
    expect(getSuggestionPanelMode({ ...newDrawn, onSidewalk: false, obstructs: false, severity: null })).toBe("sidewalk");
  });

  it("asks it even of a box answered Yes or No before the question existed", () => {
    expect(getSuggestionPanelMode({ ...untouched, selected: true, obstructs: true, severity: 3 })).toBe("sidewalk");
    expect(getSuggestionPanelMode({ ...newDrawn, obstructs: false, severity: null })).toBe("sidewalk");
  });

  it("goes on to today's modes once the box is on the sidewalk", () => {
    expect(getSuggestionPanelMode({ ...untouched, onSidewalk: true })).toBe("judge");
    expect(getSuggestionPanelMode({ ...untouched, onSidewalk: true, selected: true, obstructs: true, severity: null })).toBe("severity");
    expect(getSuggestionPanelMode({ ...untouched, onSidewalk: true, selected: true, obstructs: true, severity: 2 })).toBe("confirmed");
    expect(getSuggestionPanelMode({ ...newDrawn, onSidewalk: true })).toBe("drawn");
    expect(getSuggestionPanelMode({ ...newDrawn, onSidewalk: true, obstructs: true, severity: null })).toBe("severity");
  });

  it("never asks it of a box marked Not an object", () => {
    expect(getSuggestionPanelMode({ ...untouched, comment: "not_an_object", isRejected: true, obstructs: false })).toBe("not_an_object");
  });

  it("does not ask it with askOnSidewalk false", () => {
    expect(getSuggestionPanelMode({ ...untouched, askOnSidewalk: false })).toBe("judge");
    expect(getSuggestionPanelMode({ ...newDrawn, askOnSidewalk: false })).toBe("drawn");
  });
});

describe("the sidewalk answer's patches", () => {
  it("records a suggestion not on the sidewalk as today's No, never as Not an object", () => {
    const patch = offSidewalkPatch({ editable: false });
    expect(patch).toEqual({ onSidewalk: false, obstructs: false, severity: null, selected: false, isRejected: true });
    expect(patch).not.toHaveProperty("comment");
  });

  it("records a drawn box not on the sidewalk with obstructs false and no severity", () => {
    expect(offSidewalkPatch({ editable: true })).toEqual({ onSidewalk: false, obstructs: false, severity: null });
  });

  it("puts a box on the sidewalk with the obstruction question still to answer", () => {
    const suggestion = { editable: false, selected: false, isRejected: true, onSidewalk: false, obstructs: false, severity: null, comment: "car" };
    const changed = { ...suggestion, ...onSidewalkPatch(suggestion) };
    expect(changed).toMatchObject({ onSidewalk: true, selected: false, isRejected: false, severity: null, comment: "car" });
    expect(changed.obstructs).toBeUndefined();
    expect(onSidewalkPatch({ editable: true })).not.toHaveProperty("selected");
  });

  it("tells a box off the walking path from Not an object", () => {
    expect(isOffSidewalk({ onSidewalk: false, comment: "tree" })).toBe(true);
    expect(isOffSidewalk({ onSidewalk: true, comment: "tree" })).toBe(false);
    expect(isOffSidewalk({ comment: "tree" })).toBe(false);
    expect(isOffSidewalk({ onSidewalk: false, comment: "not_an_object" })).toBe(false);
    expect(isOffSidewalk(null)).toBe(false);
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

// Only a path (S15, 9 Nov 2026): no sidewalk question, straight to whether it obstructs
describe("getSuggestionPanelMode with pathOnly", () => {
  const base = { editable: false, selected: false, obstructs: undefined, severity: null, comment: "tree", onSidewalk: undefined };
  it("skips the sidewalk question for a path", () => {
    expect(getSuggestionPanelMode({ ...base })).toBe("sidewalk");
    expect(getSuggestionPanelMode({ ...base, pathOnly: true })).toBe("judge");
    expect(getSuggestionPanelMode({ ...base, editable: true, comment: "bollard", pathOnly: true })).toBe("drawn");
  });

  it("keeps the rest as for a sidewalk", () => {
    expect(getSuggestionPanelMode({ ...base, pathOnly: true, selected: true, obstructs: true, severity: null })).toBe("severity");
    expect(getSuggestionPanelMode({ ...base, pathOnly: true, selected: true, obstructs: true, severity: 3 })).toBe("confirmed");
    expect(getSuggestionPanelMode({ ...base, pathOnly: true, comment: NOT_AN_OBJECT })).toBe("not_an_object");
  });
});

describe("applyPresenceChange (S15)", () => {
  const box = (id, extra = {}) => ({ id, comment: "tree", mark: { x: 0, y: 0, width: 5, height: 5 }, editable: false, selected: false, isRejected: false, ...extra });
  const offPath = box("off", { ...offSidewalkPatch({ editable: false }) });
  const onYes = box("yes", { onSidewalk: true, selected: true, obstructs: true, severity: 4 });
  const onUndecided = box("pending", { onSidewalk: true });
  const drawnOff = box("drawn-off", { editable: true, comment: "bench", ...offSidewalkPatch({ editable: true }) });
  const drawnNo = box("drawn-no", { editable: true, comment: "bench", onSidewalk: true, obstructs: false, severity: null });
  const nao = box("nao", { ...notAnObjectPatch() });
  const untouched = box("untouched");

  it("Yes to No: a box off the path goes back to Still to decide, one on it keeps its answer without onSidewalk", () => {
    const before = [offPath, onYes, onUndecided, drawnOff, drawnNo, nao, untouched];
    const copy = JSON.parse(JSON.stringify(before));
    const { boxes, resetIds } = applyPresenceChange(before, true, false);
    expect(resetIds).toEqual(["off", "drawn-off"]);
    const [off, yes, pending, dOff, dNo, notObject, same] = boxes;
    expect(off).not.toHaveProperty("onSidewalk");
    expect(off).not.toHaveProperty("obstructs");
    expect(off).not.toHaveProperty("severity");
    expect(off).not.toHaveProperty("isRejected");
    expect(off).toMatchObject({ id: "off", comment: "tree", selected: false });
    const withoutSidewalk = { ...onYes };
    delete withoutSidewalk.onSidewalk;
    expect(yes).toEqual(withoutSidewalk);
    expect(yes).toMatchObject({ selected: true, obstructs: true, severity: 4 });
    expect(pending).not.toHaveProperty("onSidewalk");
    expect(dOff).toEqual({ id: "drawn-off", comment: "bench", mark: drawnOff.mark, editable: true, selected: false, isRejected: false });
    expect(dNo).toMatchObject({ obstructs: false, severity: null });
    expect(dNo).not.toHaveProperty("onSidewalk");
    // Not an object and the categories are kept
    expect(notObject).toBe(nao);
    expect(same).toBe(untouched);
    // The boxes given are not changed
    expect(before).toEqual(copy);
  });

  it("No to Yes: every real box answered goes back to Still to decide, Not an object kept", () => {
    const pathYes = box("p-yes", { selected: true, obstructs: true, severity: 2 });
    const pathNo = box("p-no", { isRejected: true, obstructs: false, severity: null });
    const pathDrawn = box("p-drawn", { editable: true, comment: "bench", obstructs: true, severity: 5 });
    const { boxes, resetIds } = applyPresenceChange([pathYes, pathNo, pathDrawn, nao, untouched], false, true);
    expect(resetIds).toEqual(["p-yes", "p-no", "p-drawn"]);
    for (const b of boxes.slice(0, 3)) {
      expect(b).not.toHaveProperty("obstructs");
      expect(b).not.toHaveProperty("severity");
    }
    expect(boxes[0]).not.toHaveProperty("selected");
    expect(boxes[1]).not.toHaveProperty("isRejected");
    expect(boxes[2]).toMatchObject({ editable: true, comment: "bench", selected: false });
    expect(boxes[0].comment).toBe("tree");
    expect(boxes[3]).toBe(nao);
    expect(boxes[4]).toBe(untouched);
  });

  it("changes nothing for the same answer, a first answer, or anything that is not a box", () => {
    for (const [from, to] of [[true, true], [false, false], [null, true], [null, false]]) {
      const { boxes, resetIds } = applyPresenceChange([offPath, onYes], from, to);
      expect(boxes[0]).toBe(offPath);
      expect(boxes[1]).toBe(onYes);
      expect(resetIds).toEqual([]);
    }
    expect(applyPresenceChange(null, true, false)).toEqual({ boxes: [], resetIds: [] });
    expect(applyPresenceChange([null, "x"], true, false).boxes).toEqual([null, "x"]);
  });
});
