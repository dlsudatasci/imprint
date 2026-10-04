import { describe, it, expect } from "vitest";
import {
  MAX_BOXES_PER_IMAGE,
  SIDEWALK_WIDTH_OPTIONS,
  validateSceneLevel,
  validateBoxes,
  normalizeAnnotatorSubmission,
  validateAnnotatorObjectBoxes,
  normalizeSubmittedMarks,
  hasEmptyBox,
} from "./annotationSubmit.js";

describe("validateSceneLevel", () => {
  const validScene = {
    sidewalkWidth: "two_people",
    surfaceCondition: 2,
    walkability: 3,
    overallAccessibility: 3,
  };

  it("accepts a valid scene with sidewalk present", () => {
    expect(validateSceneLevel(validScene)).toEqual({ valid: true });
  });

  it("accepts all sidewalkWidth values", () => {
    for (const val of ["no_sidewalk", "one_person", "two_people", "three_or_more"]) {
      const scene = val === "no_sidewalk"
        ? { sidewalkWidth: val, surfaceCondition: null, walkability: null, overallAccessibility: null }
        : { ...validScene, sidewalkWidth: val };
      expect(validateSceneLevel(scene).valid).toBe(true);
    }
  });

  it("accepts no sidewalk with the other three questions left empty (2 Oct 2026)", () => {
    const noSidewalk = {
      sidewalkWidth: "no_sidewalk",
      surfaceCondition: null,
      walkability: null,
      overallAccessibility: null,
    };
    expect(validateSceneLevel(noSidewalk)).toEqual({ valid: true });
  });

  it("accepts no sidewalk with the other three questions absent", () => {
    expect(validateSceneLevel({ sidewalkWidth: "no_sidewalk" })).toEqual({ valid: true });
  });

  it("rejects walking comfort or accessibility answered when there is no sidewalk", () => {
    const empty = { sidewalkWidth: "no_sidewalk", surfaceCondition: null, walkability: null, overallAccessibility: null };
    expect(validateSceneLevel({ ...empty, walkability: 1 }).valid).toBe(false);
    expect(validateSceneLevel({ ...empty, overallAccessibility: 3 }).valid).toBe(false);
    expect(validateSceneLevel({ ...empty, walkability: 2, overallAccessibility: 2 }).valid).toBe(false);
  });

  it("still requires walking comfort and accessibility when a sidewalk is present", () => {
    expect(validateSceneLevel({ ...validScene, walkability: null }).valid).toBe(false);
    expect(validateSceneLevel({ ...validScene, overallAccessibility: undefined }).valid).toBe(false);
  });

  it("rejects null sceneLevel", () => {
    expect(validateSceneLevel(null).valid).toBe(false);
  });

  it("rejects undefined sceneLevel", () => {
    expect(validateSceneLevel(undefined).valid).toBe(false);
  });

  it("rejects non-object sceneLevel", () => {
    expect(validateSceneLevel("string").valid).toBe(false);
  });

  it("rejects invalid sidewalkWidth value", () => {
    expect(validateSceneLevel({ ...validScene, sidewalkWidth: "maybe" }).valid).toBe(false);
  });

  it("rejects legacy sidewalkPresent values", () => {
    expect(validateSceneLevel({ ...validScene, sidewalkWidth: "yes" }).valid).toBe(false);
    expect(validateSceneLevel({ ...validScene, sidewalkWidth: "no" }).valid).toBe(false);
    expect(validateSceneLevel({ ...validScene, sidewalkWidth: "partial" }).valid).toBe(false);
  });

  it("rejects surfaceCondition present when no sidewalk", () => {
    const invalid = {
      sidewalkWidth: "no_sidewalk",
      surfaceCondition: 2,
      walkability: null,
      overallAccessibility: null,
    };
    expect(validateSceneLevel(invalid).valid).toBe(false);
  });

  it("rejects missing surfaceCondition when sidewalk is present", () => {
    const invalid = { ...validScene, surfaceCondition: null };
    expect(validateSceneLevel(invalid).valid).toBe(false);
  });

  it("rejects surfaceCondition out of range (0)", () => {
    expect(validateSceneLevel({ ...validScene, surfaceCondition: 0 }).valid).toBe(false);
  });

  it("rejects surfaceCondition out of range (4)", () => {
    expect(validateSceneLevel({ ...validScene, surfaceCondition: 4 }).valid).toBe(false);
  });

  it("rejects non-integer surfaceCondition (2.5)", () => {
    expect(validateSceneLevel({ ...validScene, surfaceCondition: 2.5 }).valid).toBe(false);
  });

  it("rejects walkability out of range (0)", () => {
    expect(validateSceneLevel({ ...validScene, walkability: 0 }).valid).toBe(false);
  });

  it("rejects walkability out of range (4)", () => {
    expect(validateSceneLevel({ ...validScene, walkability: 4 }).valid).toBe(false);
  });

  it("rejects overallAccessibility out of range (0)", () => {
    expect(validateSceneLevel({ ...validScene, overallAccessibility: 0 }).valid).toBe(false);
  });

  it("accepts overallAccessibility at upper bound (5)", () => {
    expect(validateSceneLevel({ ...validScene, overallAccessibility: 5 }).valid).toBe(true);
  });

  it("rejects overallAccessibility out of range (6)", () => {
    expect(validateSceneLevel({ ...validScene, overallAccessibility: 6 }).valid).toBe(false);
  });

  it("rejects missing walkability", () => {
    expect(validateSceneLevel({ ...validScene, walkability: null }).valid).toBe(false);
  });

  it("rejects missing overallAccessibility", () => {
    expect(validateSceneLevel({ ...validScene, overallAccessibility: undefined }).valid).toBe(false);
  });
});

describe("validateBoxes", () => {
  it("accepts valid boxes", () => {
    const selected = [{ obstructs: true, severity: 3 }];
    const newOnes = [{ obstructs: false }];
    expect(validateBoxes(selected, newOnes)).toEqual({ valid: true });
  });

  it("accepts empty arrays", () => {
    expect(validateBoxes([], [])).toEqual({ valid: true });
  });

  it("rejects non-array selectedObjectsID", () => {
    expect(validateBoxes("not-array", []).valid).toBe(false);
  });

  it("rejects non-array newObjects", () => {
    expect(validateBoxes([], "not-array").valid).toBe(false);
  });

  it("rejects when total boxes exceed MAX_BOXES_PER_IMAGE", () => {
    const many = Array.from({ length: 301 }, () => ({ obstructs: false }));
    expect(validateBoxes(many, []).valid).toBe(false);
  });

  it("accepts exactly MAX_BOXES_PER_IMAGE boxes", () => {
    const exact = Array.from({ length: MAX_BOXES_PER_IMAGE }, () => ({ obstructs: false }));
    expect(validateBoxes(exact, []).valid).toBe(true);
  });

  it("rejects box missing obstructs field", () => {
    expect(validateBoxes([{ severity: 3 }], []).valid).toBe(false);
  });

  it("rejects box with non-boolean obstructs", () => {
    expect(validateBoxes([{ obstructs: "yes" }], []).valid).toBe(false);
  });

  it("rejects obstructing box without severity", () => {
    expect(validateBoxes([{ obstructs: true }], []).valid).toBe(false);
  });

  it("rejects obstructing box with severity out of range (0)", () => {
    expect(validateBoxes([{ obstructs: true, severity: 0 }], []).valid).toBe(false);
  });

  it("rejects obstructing box with severity out of range (6)", () => {
    expect(validateBoxes([{ obstructs: true, severity: 6 }], []).valid).toBe(false);
  });

  it("does not require severity when obstructs is false", () => {
    expect(validateBoxes([{ obstructs: false }], []).valid).toBe(true);
  });

  it("accepts a not-an-object suggestion with obstructs false", () => {
    expect(validateBoxes([{ comment: "not_an_object", obstructs: false }], []).valid).toBe(true);
  });

  it("rejects a not-an-object suggestion with obstructs true", () => {
    const result = validateBoxes([{ comment: "not_an_object", obstructs: true, severity: 3 }], []);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("not an object cannot be an obstruction");
  });

  it("rejects a not-an-object box in newObjects", () => {
    const result = validateBoxes([], [{ comment: "not_an_object", obstructs: false }]);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("Only model suggestions");
  });
});

// Annotators give no severity (3 Oct 2026)
describe("validateBoxes with requireSeverity false", () => {
  const noSeverity = { requireSeverity: false };

  it("accepts an obstructing box without severity", () => {
    expect(validateBoxes([{ obstructs: true }], [{ obstructs: true, severity: null }], noSeverity)).toEqual({ valid: true });
  });

  it("still rejects a non-boolean obstructs", () => {
    expect(validateBoxes([{ obstructs: "yes" }], [], noSeverity).valid).toBe(false);
    expect(validateBoxes([], [{ severity: null }], noSeverity).valid).toBe(false);
  });

  it("keeps the array, box limit and not-an-object rules", () => {
    expect(validateBoxes("not-array", [], noSeverity).valid).toBe(false);
    const many = Array.from({ length: MAX_BOXES_PER_IMAGE + 1 }, () => ({ obstructs: false }));
    expect(validateBoxes(many, [], noSeverity).valid).toBe(false);
    expect(validateBoxes([{ comment: "not_an_object", obstructs: true }], [], noSeverity).valid).toBe(false);
    expect(validateBoxes([], [{ comment: "not_an_object", obstructs: false }], noSeverity).valid).toBe(false);
  });

  it("requires severity by default", () => {
    expect(validateBoxes([{ obstructs: true }], []).valid).toBe(false);
    expect(validateBoxes([{ obstructs: true }], [], {}).valid).toBe(false);
  });
});

describe("normalizeAnnotatorSubmission", () => {
  const input = () => ({
    sceneLevel: { sidewalkWidth: "two_people", surfaceCondition: 2, walkability: 3, overallAccessibility: 3 },
    selectedObjectsID: [
      { id: "s1", comment: "tree", obstructs: true, severity: 4 },
      { id: "s2", comment: "not_an_object", obstructs: false, severity: null },
    ],
    newObjects: [{ id: "n1", comment: "car", obstructs: false, severity: 2 }],
  });

  it("sets sceneLevel to null and every obstructs and severity to null (4 Oct 2026)", () => {
    const out = normalizeAnnotatorSubmission(input());
    expect(out.sceneLevel).toBeNull();
    for (const box of [...out.selectedObjectsID, ...out.newObjects]) {
      expect(box.severity).toBeNull();
      expect(box.obstructs).toBeNull();
    }
  });

  it("keeps every other box field", () => {
    const out = normalizeAnnotatorSubmission(input());
    expect(out.selectedObjectsID[0]).toEqual({ id: "s1", comment: "tree", obstructs: null, severity: null });
    expect(out.newObjects[0]).toEqual({ id: "n1", comment: "car", obstructs: null, severity: null });
  });

  it("does not mutate its input", () => {
    const original = input();
    const snapshot = structuredClone(original);
    const out = normalizeAnnotatorSubmission(original);
    expect(original).toEqual(snapshot);
    expect(out.selectedObjectsID).not.toBe(original.selectedObjectsID);
    expect(out.selectedObjectsID[0]).not.toBe(original.selectedObjectsID[0]);
  });

  it("passes non-array box lists through for validateBoxes to reject", () => {
    const out = normalizeAnnotatorSubmission({ sceneLevel: null, selectedObjectsID: undefined, newObjects: "x" });
    expect(validateBoxes(out.selectedObjectsID, out.newObjects, { requireSeverity: false }).valid).toBe(false);
  });
});

// Annotators, Step 1 Objects (4 Oct 2026)
describe("validateAnnotatorObjectBoxes", () => {
  const mark = { type: "RECT", x: 10, y: 10, width: 50, height: 50 };
  const kept = { id: "s1", editable: false, selected: true, isRejected: false, comment: "tree", obstructs: null, severity: null, mark };
  const notAnObject = { id: "s2", editable: false, selected: false, isRejected: true, comment: "not_an_object", obstructs: null, severity: null, mark };
  const drawn = { id: "d1", editable: true, comment: "car", obstructs: null, severity: null, mark };

  it("accepts kept, Not an object and drawn boxes with obstructs null", () => {
    expect(validateAnnotatorObjectBoxes([kept, notAnObject], [drawn])).toEqual({ valid: true });
    expect(validateAnnotatorObjectBoxes([], [])).toEqual({ valid: true });
  });

  it("refuses a drawn box marked Not an object", () => {
    const r = validateAnnotatorObjectBoxes([], [{ ...drawn, comment: "not_an_object" }]);
    expect(r.valid).toBe(false);
    expect(r.message).toContain("Only model suggestions");
  });

  it("refuses a free-text category on a drawn or kept box", () => {
    expect(validateAnnotatorObjectBoxes([], [{ ...drawn, comment: "truck" }]).message).toBe("Every box must have a category from the list.");
    expect(validateAnnotatorObjectBoxes([{ ...kept, comment: "truck" }], []).message).toBe("Every box must have a category from the list.");
  });

  it("refuses an undecided suggestion and an old No answer", () => {
    const message = "Every suggested box must be kept or marked not an object.";
    expect(validateAnnotatorObjectBoxes([{ ...kept, selected: false }], []).message).toBe(message);
    expect(validateAnnotatorObjectBoxes([{ ...kept, selected: false, isRejected: true, obstructs: false }], []).message).toBe(message);
  });

  it("refuses non-arrays and more than 300 boxes", () => {
    expect(validateAnnotatorObjectBoxes("x", []).valid).toBe(false);
    expect(validateAnnotatorObjectBoxes([], null).valid).toBe(false);
    const many = Array.from({ length: MAX_BOXES_PER_IMAGE + 1 }, (_, i) => ({ ...drawn, id: `d${i}` }));
    expect(validateAnnotatorObjectBoxes([], many).message).toBe("Too many boxes for a single image.");
  });

  it("refuses a box without a numeric mark", () => {
    const message = "Every box must have a position (x, y, width and height).";
    expect(validateAnnotatorObjectBoxes([], [{ ...drawn, mark: undefined }]).message).toBe(message);
    expect(validateAnnotatorObjectBoxes([], [{ ...drawn, mark: { ...mark, width: "50" } }]).message).toBe(message);
    expect(validateAnnotatorObjectBoxes([{ ...kept, mark: { ...mark, x: NaN } }], []).message).toBe(message);
  });
});

// Both roles (4 Oct 2026): boxes drawn up or to the left had negative sizes
describe("normalizeSubmittedMarks", () => {
  const box = (m, extra = {}) => ({ id: "b", comment: "tree", mark: m, ...extra });

  it("normalizes negative sizes and clamps to the image", () => {
    const [out] = normalizeSubmittedMarks([box({ type: "RECT", x: 120, y: 60, width: -40, height: -30 })], 100, 50);
    expect(out.mark).toEqual({ type: "RECT", x: 80, y: 30, width: 20, height: 20 });
  });

  it("normalizes even when the image size is unknown", () => {
    const [out] = normalizeSubmittedMarks([box({ x: 40, y: 40, width: -10, height: -10 })], undefined, undefined);
    expect(out.mark).toEqual({ x: 30, y: 30, width: 10, height: 10 });
  });

  it("leaves initialState, Not an object boxes and boxes without a mark alone", () => {
    const initialState = { comment: "tree", mark: { x: 50, y: 50, width: -10, height: -10 } };
    const [withInit] = normalizeSubmittedMarks([box({ x: 50, y: 50, width: -10, height: -10 }, { initialState })], 100, 100);
    expect(withInit.initialState).toBe(initialState);

    const nao = box({ x: 50, y: 50, width: -10, height: -10 }, { comment: "not_an_object" });
    const noMark = { id: "c", obstructs: false };
    const out = normalizeSubmittedMarks([nao, noMark], 100, 100);
    expect(out[0]).toBe(nao);
    expect(out[1]).toBe(noMark);
  });

  it("does not mutate its input and passes non-arrays through", () => {
    const input = [box({ x: 50, y: 50, width: -10, height: -10 })];
    const snapshot = structuredClone(input);
    const out = normalizeSubmittedMarks(input, 100, 100);
    expect(input).toEqual(snapshot);
    expect(out[0]).not.toBe(input[0]);
    expect(normalizeSubmittedMarks("x", 100, 100)).toBe("x");
  });
});

describe("hasEmptyBox", () => {
  it("is true when a real box has zero area", () => {
    expect(hasEmptyBox([{ comment: "tree", mark: { x: 0, y: 0, width: 0, height: 10 } }])).toBe(true);
  });

  it("is false for boxes with area, Not an object boxes and boxes without a mark", () => {
    expect(hasEmptyBox([
      { comment: "tree", mark: { x: 0, y: 0, width: 5, height: 10 } },
      { comment: "not_an_object", mark: { x: 0, y: 0, width: 0, height: 0 } },
      { comment: "car", obstructs: false },
    ])).toBe(false);
    expect(hasEmptyBox("x")).toBe(false);
  });
});

describe("constants", () => {
  it("MAX_BOXES_PER_IMAGE is 300", () => {
    expect(MAX_BOXES_PER_IMAGE).toBe(300);
  });

  it("SIDEWALK_WIDTH_OPTIONS has 4 entries", () => {
    expect(SIDEWALK_WIDTH_OPTIONS).toHaveLength(4);
    expect(SIDEWALK_WIDTH_OPTIONS).toEqual(["no_sidewalk", "one_person", "two_people", "three_or_more"]);
  });
});
