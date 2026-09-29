import { describe, it, expect } from "vitest";
import { validateAnnotationForSubmit } from "./clientAnnotation.js";

const validSceneLevel = {
  sidewalkWidth: "two_people",
  surfaceCondition: 3,
  walkability: 4,
  overallAccessibility: 3,
};

function makeInput(overrides = {}) {
  return {
    existingAnnotations: [],
    newObjects: [{ comment: "pole", obstructs: true, severity: 3 }],
    selectedObjects: [{ comment: "tree", obstructs: false }],
    sceneLevel: { ...validSceneLevel },
    ...overrides,
  };
}

describe("validateAnnotationForSubmit", () => {
  it("passes when all data is valid", () => {
    const result = validateAnnotationForSubmit(makeInput());
    expect(result).toEqual({ valid: true });
  });

  it("fails when an existing annotation is unconfirmed", () => {
    const result = validateAnnotationForSubmit(
      makeInput({
        existingAnnotations: [{ editable: false, selected: false, isRejected: false }],
      })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Yes or No");
  });

  it("passes when existing annotation is selected (confirmed)", () => {
    const result = validateAnnotationForSubmit(
      makeInput({
        existingAnnotations: [{ editable: false, selected: true, isRejected: false, obstructs: true, severity: 2 }],
      })
    );
    expect(result.valid).toBe(true);
  });

  it("passes when existing annotation is rejected", () => {
    const result = validateAnnotationForSubmit(
      makeInput({
        existingAnnotations: [{ editable: false, selected: false, isRejected: true }],
      })
    );
    expect(result.valid).toBe(true);
  });

  it("fails when a new object has no label", () => {
    const result = validateAnnotationForSubmit(
      makeInput({ newObjects: [{ comment: "", obstructs: false }] })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("unlabeled");
  });

  it("fails when a selected object has placeholder label '---'", () => {
    const result = validateAnnotationForSubmit(
      makeInput({ selectedObjects: [{ comment: "---", obstructs: false }] })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("unlabeled");
  });

  it("fails when a box is missing obstruction judgment", () => {
    const result = validateAnnotationForSubmit(
      makeInput({ newObjects: [{ comment: "pole", obstructs: undefined }] })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("obstructs");
  });

  it("fails when an obstructing box has no severity", () => {
    const result = validateAnnotationForSubmit(
      makeInput({ newObjects: [{ comment: "pole", obstructs: true, severity: null }] })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("severity");
  });

  it("passes when non-obstructing box has no severity", () => {
    const result = validateAnnotationForSubmit(
      makeInput({ newObjects: [{ comment: "bench", obstructs: false }] })
    );
    expect(result.valid).toBe(true);
  });

  it("fails when sidewalkWidth is not selected", () => {
    const result = validateAnnotationForSubmit(
      makeInput({ sceneLevel: { ...validSceneLevel, sidewalkWidth: "" } })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("sidewalk width");
  });

  it("fails when surfaceCondition is null with sidewalk present", () => {
    const result = validateAnnotationForSubmit(
      makeInput({ sceneLevel: { ...validSceneLevel, surfaceCondition: null } })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("surface condition");
  });

  it("passes when surfaceCondition is null with no_sidewalk", () => {
    const result = validateAnnotationForSubmit(
      makeInput({
        sceneLevel: { sidewalkWidth: "no_sidewalk", surfaceCondition: null, walkability: 2, overallAccessibility: 1 },
      })
    );
    expect(result.valid).toBe(true);
  });

  it("fails when walkability is null", () => {
    const result = validateAnnotationForSubmit(
      makeInput({ sceneLevel: { ...validSceneLevel, walkability: null } })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("walkability");
  });

  it("fails when overallAccessibility is null", () => {
    const result = validateAnnotationForSubmit(
      makeInput({ sceneLevel: { ...validSceneLevel, overallAccessibility: null } })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("accessibility");
  });

  it("passes when a suggestion is marked not an object", () => {
    const result = validateAnnotationForSubmit(
      makeInput({
        existingAnnotations: [
          { editable: false, selected: false, isRejected: true, comment: "not_an_object", obstructs: false },
        ],
      })
    );
    expect(result.valid).toBe(true);
  });

  it("fails when a suggestion relabeled to empty is answered No", () => {
    const result = validateAnnotationForSubmit(
      makeInput({
        existingAnnotations: [
          { editable: false, selected: false, isRejected: true, comment: "" },
        ],
        selectedObjects: [{ comment: "", obstructs: false }],
      })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("unlabeled");
  });
});
