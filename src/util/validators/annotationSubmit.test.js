import { describe, it, expect } from "vitest";
import {
  MAX_BOXES_PER_IMAGE,
  SIDEWALK_WIDTH_OPTIONS,
  validateSceneLevel,
  validateBoxes,
  normalizeAnnotatorSubmission,
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

  it("sets sceneLevel to null and every severity to null", () => {
    const out = normalizeAnnotatorSubmission(input());
    expect(out.sceneLevel).toBeNull();
    for (const box of [...out.selectedObjectsID, ...out.newObjects]) expect(box.severity).toBeNull();
  });

  it("keeps every other box field", () => {
    const out = normalizeAnnotatorSubmission(input());
    expect(out.selectedObjectsID[0]).toEqual({ id: "s1", comment: "tree", obstructs: true, severity: null });
    expect(out.newObjects[0]).toEqual({ id: "n1", comment: "car", obstructs: false, severity: null });
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

describe("constants", () => {
  it("MAX_BOXES_PER_IMAGE is 300", () => {
    expect(MAX_BOXES_PER_IMAGE).toBe(300);
  });

  it("SIDEWALK_WIDTH_OPTIONS has 4 entries", () => {
    expect(SIDEWALK_WIDTH_OPTIONS).toHaveLength(4);
    expect(SIDEWALK_WIDTH_OPTIONS).toEqual(["no_sidewalk", "one_person", "two_people", "three_or_more"]);
  });
});
