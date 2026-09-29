import { describe, it, expect } from "vitest";
import {
  GEOMETRY_TOLERANCE_PX,
  TAU_THRESHOLD,
  filterAnnotationsByTau,
  computeStepTimings,
  buildSuggestionConfidences,
  buildGeometryChanges,
  buildLabelChanges,
  buildSubmissionCounts,
} from "./telemetryPayload";

describe("computeStepTimings", () => {
  it("splits time at the scene step boundary", () => {
    const result = computeStepTimings(1000, 4000, 6000);
    expect(result).toEqual({ msObjectStep: 3000, msSceneStep: 2000 });
  });

  it("assigns all time to object step when scene step never started", () => {
    const result = computeStepTimings(1000, null, 6000);
    expect(result).toEqual({ msObjectStep: 5000, msSceneStep: 0 });
  });

  it("assigns all time to object step when scene step is undefined", () => {
    const result = computeStepTimings(1000, undefined, 6000);
    expect(result).toEqual({ msObjectStep: 5000, msSceneStep: 0 });
  });

  it("handles scene step starting at the same time as mount", () => {
    const result = computeStepTimings(1000, 1000, 5000);
    expect(result).toEqual({ msObjectStep: 0, msSceneStep: 4000 });
  });

  it("handles zero duration", () => {
    const result = computeStepTimings(1000, 1000, 1000);
    expect(result).toEqual({ msObjectStep: 0, msSceneStep: 0 });
  });
});

const baseMark = { x: 10, y: 20, width: 100, height: 50 };

function makeSuggestion(overrides = {}) {
  return {
    id: "s1",
    editable: false,
    selected: true,
    isRejected: false,
    confidence: 0.85,
    comment: "parked_car",
    mark: { ...baseMark },
    initialState: { comment: "parked_car", mark: { ...baseMark } },
    ...overrides,
  };
}

describe("buildSuggestionConfidences", () => {
  it("returns accepted for an unmodified suggestion", () => {
    const result = buildSuggestionConfidences([makeSuggestion()]);
    expect(result).toEqual([{ id: "s1", confidence: 0.85, action: "accepted" }]);
  });

  it("returns deleted for a rejected suggestion", () => {
    const result = buildSuggestionConfidences([
      makeSuggestion({ isRejected: true, selected: false }),
    ]);
    expect(result).toEqual([{ id: "s1", confidence: 0.85, action: "deleted" }]);
  });

  it("returns not_an_object for a marked suggestion", () => {
    const result = buildSuggestionConfidences([
      makeSuggestion({ isRejected: true, selected: false, comment: "not_an_object" }),
    ]);
    expect(result).toEqual([{ id: "s1", confidence: 0.85, action: "not_an_object" }]);
  });

  it("returns modified when label changed", () => {
    const result = buildSuggestionConfidences([
      makeSuggestion({ comment: "bollard" }),
    ]);
    expect(result).toEqual([{ id: "s1", confidence: 0.85, action: "modified" }]);
  });

  it("returns modified when geometry changed beyond tolerance", () => {
    const result = buildSuggestionConfidences([
      makeSuggestion({ mark: { ...baseMark, x: baseMark.x + 5 } }),
    ]);
    expect(result).toEqual([{ id: "s1", confidence: 0.85, action: "modified" }]);
  });

  it("returns accepted when geometry change is within tolerance", () => {
    const result = buildSuggestionConfidences([
      makeSuggestion({ mark: { ...baseMark, x: baseMark.x + 2 } }),
    ]);
    expect(result).toEqual([{ id: "s1", confidence: 0.85, action: "accepted" }]);
  });

  it("skips user-drawn boxes", () => {
    const result = buildSuggestionConfidences([
      { id: "m1", editable: true, selected: false, isRejected: false, comment: "tree", mark: baseMark },
    ]);
    expect(result).toEqual([]);
  });

  it("skips unresolved suggestions", () => {
    const result = buildSuggestionConfidences([
      makeSuggestion({ selected: false, isRejected: false }),
    ]);
    expect(result).toEqual([]);
  });

  it("uses null when confidence is missing", () => {
    const result = buildSuggestionConfidences([
      makeSuggestion({ confidence: undefined }),
    ]);
    expect(result).toEqual([{ id: "s1", confidence: null, action: "accepted" }]);
  });

  it("handles multiple suggestions with different actions", () => {
    const result = buildSuggestionConfidences([
      makeSuggestion({ id: "s1" }),
      makeSuggestion({ id: "s2", isRejected: true, selected: false, confidence: 0.3 }),
      makeSuggestion({ id: "s3", comment: "bollard", confidence: 0.6 }),
    ]);
    expect(result).toEqual([
      { id: "s1", confidence: 0.85, action: "accepted" },
      { id: "s2", confidence: 0.3, action: "deleted" },
      { id: "s3", confidence: 0.6, action: "modified" },
    ]);
  });
});

describe("buildGeometryChanges", () => {
  it("returns empty for unmodified geometry", () => {
    const result = buildGeometryChanges([makeSuggestion()]);
    expect(result).toEqual([]);
  });

  it("captures changes beyond tolerance", () => {
    const moved = makeSuggestion({ mark: { x: 15, y: 20, width: 100, height: 50 } });
    const result = buildGeometryChanges([moved]);
    expect(result).toEqual([{
      id: "s1",
      originalBox: { x: 10, y: 20, w: 100, h: 50 },
      finalBox: { x: 15, y: 20, w: 100, h: 50 },
      deltaPx: 5,
    }]);
  });

  it("excludes changes at exactly tolerance", () => {
    const moved = makeSuggestion({ mark: { ...baseMark, x: baseMark.x + GEOMETRY_TOLERANCE_PX } });
    const result = buildGeometryChanges([moved]);
    expect(result).toEqual([]);
  });

  it("excludes changes below tolerance", () => {
    const moved = makeSuggestion({ mark: { ...baseMark, y: baseMark.y + 1 } });
    const result = buildGeometryChanges([moved]);
    expect(result).toEqual([]);
  });

  it("skips rejected suggestions", () => {
    const result = buildGeometryChanges([
      makeSuggestion({ isRejected: true, selected: false, mark: { ...baseMark, x: 100 } }),
    ]);
    expect(result).toEqual([]);
  });

  it("skips user-drawn boxes", () => {
    const result = buildGeometryChanges([
      { id: "m1", editable: true, selected: false, isRejected: false, mark: baseMark, initialState: { comment: "", mark: baseMark } },
    ]);
    expect(result).toEqual([]);
  });

  it("skips suggestions without initialState", () => {
    const noInit = makeSuggestion({ mark: { ...baseMark, x: 100 } });
    delete noInit.initialState;
    const result = buildGeometryChanges([noInit]);
    expect(result).toEqual([]);
  });

  it("uses max delta across all dimensions", () => {
    const moved = makeSuggestion({
      mark: { x: baseMark.x + 4, y: baseMark.y + 10, width: baseMark.width, height: baseMark.height },
    });
    const result = buildGeometryChanges([moved]);
    expect(result[0].deltaPx).toBe(10);
  });
});

describe("buildLabelChanges", () => {
  it("returns empty when labels match", () => {
    const result = buildLabelChanges([makeSuggestion()]);
    expect(result).toEqual([]);
  });

  it("captures label change", () => {
    const result = buildLabelChanges([
      makeSuggestion({ comment: "bollard" }),
    ]);
    expect(result).toEqual([{
      id: "s1",
      originalLabel: "parked_car",
      finalLabel: "bollard",
    }]);
  });

  it("ignores case and underscore differences", () => {
    const result = buildLabelChanges([
      makeSuggestion({ comment: "Parked Car" }),
    ]);
    expect(result).toEqual([]);
  });

  it("records label changes on suggestions answered No", () => {
    const result = buildLabelChanges([
      makeSuggestion({ isRejected: true, selected: false, comment: "bollard" }),
    ]);
    expect(result).toEqual([{
      id: "s1",
      originalLabel: "parked_car",
      finalLabel: "bollard",
    }]);
  });

  it("skips suggestions marked not an object", () => {
    const result = buildLabelChanges([
      makeSuggestion({ isRejected: true, selected: false, comment: "not_an_object" }),
    ]);
    expect(result).toEqual([]);
  });

  it("skips user-drawn boxes", () => {
    const result = buildLabelChanges([
      { id: "m1", editable: true, selected: false, isRejected: false, comment: "tree", mark: baseMark, initialState: { comment: "car", mark: baseMark } },
    ]);
    expect(result).toEqual([]);
  });

  it("handles empty original label", () => {
    const result = buildLabelChanges([
      makeSuggestion({
        comment: "bollard",
        initialState: { comment: "", mark: { ...baseMark } },
      }),
    ]);
    expect(result).toEqual([{
      id: "s1",
      originalLabel: "",
      finalLabel: "bollard",
    }]);
  });
});

describe("filterAnnotationsByTau", () => {
  it("hides suggestions below tau", () => {
    const annotations = [
      makeSuggestion({ id: "s1", confidence: 0.3 }),
      makeSuggestion({ id: "s2", confidence: 0.7 }),
    ];
    const { visible, hidden } = filterAnnotationsByTau(annotations, 0.5);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("s2");
    expect(hidden).toHaveLength(1);
    expect(hidden[0].id).toBe("s1");
  });

  it("keeps user-drawn boxes regardless of confidence", () => {
    const annotations = [
      { id: "m1", editable: true, confidence: 0.1, mark: baseMark },
    ];
    const { visible, hidden } = filterAnnotationsByTau(annotations, 0.5);
    expect(visible).toHaveLength(1);
    expect(hidden).toHaveLength(0);
  });

  it("keeps suggestions without a confidence field", () => {
    const annotations = [makeSuggestion({ id: "s1", confidence: undefined })];
    const { visible, hidden } = filterAnnotationsByTau(annotations, 0.5);
    expect(visible).toHaveLength(1);
    expect(hidden).toHaveLength(0);
  });

  it("hides at exactly tau", () => {
    const annotations = [makeSuggestion({ id: "s1", confidence: 0.5 })];
    const { visible, hidden } = filterAnnotationsByTau(annotations, 0.5);
    expect(visible).toHaveLength(1);
    expect(hidden).toHaveLength(0);
  });

  it("hides just below tau", () => {
    const annotations = [makeSuggestion({ id: "s1", confidence: 0.49 })];
    const { visible, hidden } = filterAnnotationsByTau(annotations, 0.5);
    expect(visible).toHaveLength(0);
    expect(hidden).toHaveLength(1);
  });

  it("returns all visible when tau is 0", () => {
    const annotations = [
      makeSuggestion({ id: "s1", confidence: 0 }),
      makeSuggestion({ id: "s2", confidence: 0.01 }),
    ];
    const { visible, hidden } = filterAnnotationsByTau(annotations, 0);
    expect(visible).toHaveLength(2);
    expect(hidden).toHaveLength(0);
  });
});

describe("buildSubmissionCounts", () => {
  it("returns all zeros for empty array", () => {
    expect(buildSubmissionCounts([])).toEqual({
      manualBoxCount: 0,
      acceptedSuggestionCount: 0,
      modifiedSuggestionCount: 0,
      deletedSuggestionCount: 0,
      notAnObjectSuggestionCount: 0,
      obstructionCount: 0,
      nonObstructionCount: 0,
    });
  });

  it("counts drawn boxes as manualBoxCount", () => {
    const result = buildSubmissionCounts([
      { editable: true, obstructs: true, severity: 3 },
      { editable: true, obstructs: false },
    ]);
    expect(result.manualBoxCount).toBe(2);
  });

  it("splits confirmed suggestions into accepted vs modified by label", () => {
    const result = buildSubmissionCounts([
      makeSuggestion({ id: "s1" }),
      makeSuggestion({ id: "s2", comment: "bollard" }),
    ]);
    expect(result.acceptedSuggestionCount).toBe(1);
    expect(result.modifiedSuggestionCount).toBe(1);
  });

  it("detects modified when geometry exceeds tolerance", () => {
    const result = buildSubmissionCounts([
      makeSuggestion({ mark: { ...baseMark, x: baseMark.x + 5 } }),
    ]);
    expect(result.modifiedSuggestionCount).toBe(1);
    expect(result.acceptedSuggestionCount).toBe(0);
  });

  it("keeps accepted when geometry is within tolerance", () => {
    const result = buildSubmissionCounts([
      makeSuggestion({ mark: { ...baseMark, x: baseMark.x + 2 } }),
    ]);
    expect(result.acceptedSuggestionCount).toBe(1);
    expect(result.modifiedSuggestionCount).toBe(0);
  });

  it("deletedSuggestionCount excludes not-an-object boxes", () => {
    const result = buildSubmissionCounts([
      makeSuggestion({ isRejected: true, selected: false, comment: "tree" }),
      makeSuggestion({ id: "s2", isRejected: true, selected: false, comment: "not_an_object" }),
    ]);
    expect(result.deletedSuggestionCount).toBe(1);
    expect(result.notAnObjectSuggestionCount).toBe(1);
  });

  it("nonObstructionCount includes suggestions answered No and excludes not-an-object", () => {
    const result = buildSubmissionCounts([
      makeSuggestion({ isRejected: true, selected: false, obstructs: false, comment: "tree" }),
      makeSuggestion({ id: "s2", isRejected: true, selected: false, obstructs: false, comment: "not_an_object" }),
      { editable: true, obstructs: false },
    ]);
    expect(result.nonObstructionCount).toBe(2);
  });

  it("obstructionCount counts confirmed suggestions and drawn boxes with obstructs true", () => {
    const result = buildSubmissionCounts([
      makeSuggestion({ obstructs: true }),
      { editable: true, obstructs: true, severity: 3 },
    ]);
    expect(result.obstructionCount).toBe(2);
  });
});

describe("constants", () => {
  it("exports the geometry tolerance", () => {
    expect(GEOMETRY_TOLERANCE_PX).toBe(3);
  });

  it("exports the tau threshold", () => {
    expect(TAU_THRESHOLD).toBe(0.5);
  });
});
