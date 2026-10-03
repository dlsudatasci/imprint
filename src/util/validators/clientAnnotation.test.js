import { describe, it, expect } from "vitest";
import { validateAnnotationForSubmit } from "./clientAnnotation.js";

const validSceneLevel = {
  sidewalkWidth: "two_people",
  surfaceCondition: 2,
  walkability: 2,
  overallAccessibility: 1,
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

  it("passes with no sidewalk and the other three questions left empty (2 Oct 2026)", () => {
    const result = validateAnnotationForSubmit(
      makeInput({
        sceneLevel: { sidewalkWidth: "no_sidewalk", surfaceCondition: null, walkability: null, overallAccessibility: null },
      })
    );
    expect(result.valid).toBe(true);
  });

  it("asks for surface, walking comfort and accessibility once a sidewalk width is chosen", () => {
    const empty = { sidewalkWidth: "one_person", surfaceCondition: 1, walkability: 1, overallAccessibility: 1 };
    expect(validateAnnotationForSubmit(makeInput({ sceneLevel: { ...empty, surfaceCondition: undefined } })).error).toContain("surface condition");
    expect(validateAnnotationForSubmit(makeInput({ sceneLevel: { ...empty, walkability: undefined } })).error).toContain("walking comfort");
    expect(validateAnnotationForSubmit(makeInput({ sceneLevel: { ...empty, overallAccessibility: undefined } })).error).toContain("accessibility");
  });

  it("fails when walkability is null", () => {
    const result = validateAnnotationForSubmit(
      makeInput({ sceneLevel: { ...validSceneLevel, walkability: null } })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("walking comfort");
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

// Annotators answer no scene-level questions and give no severity (3 Oct 2026)
describe("validateAnnotationForSubmit for annotators", () => {
  const suggestionYes = { editable: false, selected: true, isRejected: false, comment: "tree", obstructs: true, severity: null };
  const drawnNo = { editable: true, comment: "car", obstructs: false };

  function annotatorInput(overrides = {}) {
    return {
      existingAnnotations: [suggestionYes, drawnNo],
      newObjects: [drawnNo],
      selectedObjects: [suggestionYes],
      sceneLevel: null,
      isAnnotator: true,
      ...overrides,
    };
  }

  it("passes with sceneLevel null and an obstructing box without severity", () => {
    expect(validateAnnotationForSubmit(annotatorInput())).toEqual({ valid: true });
  });

  it("passes with an empty scene battery", () => {
    const empty = { sidewalkWidth: null, surfaceCondition: null, walkability: null, overallAccessibility: null };
    expect(validateAnnotationForSubmit(annotatorInput({ sceneLevel: empty }))).toEqual({ valid: true });
  });

  it("passes with a drawn box answered Yes and no severity", () => {
    const drawnYes = { editable: true, comment: "bench", obstructs: true };
    const result = validateAnnotationForSubmit(
      annotatorInput({ existingAnnotations: [suggestionYes, drawnYes], newObjects: [drawnYes] })
    );
    expect(result).toEqual({ valid: true });
  });

  it("still fails on an undecided suggestion", () => {
    const undecided = { editable: false, selected: false, isRejected: false, comment: "tree" };
    const result = validateAnnotationForSubmit(annotatorInput({ existingAnnotations: [undecided, drawnNo] }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Yes or No");
  });

  it("still fails on a box with no category", () => {
    const unlabeled = { editable: true, comment: "---", obstructs: false };
    const result = validateAnnotationForSubmit(
      annotatorInput({ existingAnnotations: [suggestionYes, unlabeled], newObjects: [unlabeled] })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("unlabeled");
  });

  it("still fails on a drawn box with no Yes or No", () => {
    const unanswered = { editable: true, comment: "car" };
    const result = validateAnnotationForSubmit(
      annotatorInput({ existingAnnotations: [suggestionYes, unanswered], newObjects: [unanswered] })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Please indicate whether each object obstructs the sidewalk.");
  });
});

describe("validateAnnotationForSubmit for drawn boxes (both roles)", () => {
  it("refuses a contributor's drawn box with no Yes or No", () => {
    const result = validateAnnotationForSubmit(
      makeInput({ newObjects: [{ editable: true, comment: "pole" }] })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Please indicate whether each object obstructs the sidewalk.");
  });

  it("accepts a contributor's drawn box answered No without severity", () => {
    const result = validateAnnotationForSubmit(
      makeInput({ newObjects: [{ editable: true, comment: "car", obstructs: false }] })
    );
    expect(result).toEqual({ valid: true });
  });

  it("still asks a contributor to rate a drawn box answered Yes", () => {
    const result = validateAnnotationForSubmit(
      makeInput({ newObjects: [{ editable: true, comment: "pole", obstructs: true }] })
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("severity");
  });

  it("still requires the scene battery from a contributor (isAnnotator defaults to false)", () => {
    const result = validateAnnotationForSubmit(makeInput({ sceneLevel: null }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("sidewalk width");
  });
});
