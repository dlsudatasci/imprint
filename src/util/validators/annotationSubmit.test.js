import { describe, it, expect } from "vitest";
import {
  MAX_BOXES_PER_IMAGE,
  SIDEWALK_WIDTH_OPTIONS,
  validateSceneLevel,
  validateBoxes,
} from "./annotationSubmit.js";

describe("validateSceneLevel", () => {
  const validScene = {
    sidewalkWidth: "two_people",
    surfaceCondition: 2,
    walkability: 3,
    overallAccessibility: 4,
  };

  it("accepts a valid scene with sidewalk present", () => {
    expect(validateSceneLevel(validScene)).toEqual({ valid: true });
  });

  it("accepts all sidewalkWidth values", () => {
    for (const val of ["no_sidewalk", "one_person", "two_people", "three_or_more"]) {
      const scene = val === "no_sidewalk"
        ? { ...validScene, sidewalkWidth: val, surfaceCondition: null }
        : { ...validScene, sidewalkWidth: val };
      expect(validateSceneLevel(scene).valid).toBe(true);
    }
  });

  it("accepts a valid scene with no sidewalk", () => {
    const noSidewalk = {
      sidewalkWidth: "no_sidewalk",
      surfaceCondition: null,
      walkability: 3,
      overallAccessibility: 4,
    };
    expect(validateSceneLevel(noSidewalk)).toEqual({ valid: true });
  });

  it("accepts surfaceCondition undefined when no sidewalk", () => {
    const noSidewalk = {
      sidewalkWidth: "no_sidewalk",
      walkability: 3,
      overallAccessibility: 4,
    };
    expect(validateSceneLevel(noSidewalk)).toEqual({ valid: true });
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
      walkability: 3,
      overallAccessibility: 4,
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

  it("rejects surfaceCondition out of range (5)", () => {
    expect(validateSceneLevel({ ...validScene, surfaceCondition: 5 }).valid).toBe(false);
  });

  it("rejects non-integer surfaceCondition (2.5)", () => {
    expect(validateSceneLevel({ ...validScene, surfaceCondition: 2.5 }).valid).toBe(false);
  });

  it("rejects walkability out of range (0)", () => {
    expect(validateSceneLevel({ ...validScene, walkability: 0 }).valid).toBe(false);
  });

  it("rejects walkability out of range (6)", () => {
    expect(validateSceneLevel({ ...validScene, walkability: 6 }).valid).toBe(false);
  });

  it("rejects overallAccessibility out of range (0)", () => {
    expect(validateSceneLevel({ ...validScene, overallAccessibility: 0 }).valid).toBe(false);
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

describe("constants", () => {
  it("MAX_BOXES_PER_IMAGE is 300", () => {
    expect(MAX_BOXES_PER_IMAGE).toBe(300);
  });

  it("SIDEWALK_WIDTH_OPTIONS has 4 entries", () => {
    expect(SIDEWALK_WIDTH_OPTIONS).toHaveLength(4);
    expect(SIDEWALK_WIDTH_OPTIONS).toEqual(["no_sidewalk", "one_person", "two_people", "three_or_more"]);
  });
});
