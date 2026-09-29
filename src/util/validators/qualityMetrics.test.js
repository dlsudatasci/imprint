import { describe, it, expect } from "vitest";
import {
  computeIoU,
  matchBoxesByIoU,
  computePRF1,
  computeObstructionAgreement,
  computeSeverityMAE,
  computeSceneLevelAgreement,
  computeReferencePerformance,
  detectDegenerateFlags,
  computePairwiseAgreement,
} from "./qualityMetrics";

function box(x, y, w, h, extra = {}) {
  return { mark: { x, y, width: w, height: h }, ...extra };
}

describe("computeIoU", () => {
  it("returns 1 for identical boxes", () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    expect(computeIoU(a, a)).toBe(1);
  });

  it("returns 0 for non-overlapping boxes", () => {
    const a = { x: 0, y: 0, width: 50, height: 50 };
    const b = { x: 100, y: 100, width: 50, height: 50 };
    expect(computeIoU(a, b)).toBe(0);
  });

  it("computes correct IoU for partial overlap", () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 50, y: 0, width: 100, height: 100 };
    // intersection: 50*100 = 5000, union: 10000 + 10000 - 5000 = 15000
    expect(computeIoU(a, b)).toBeCloseTo(5000 / 15000, 4);
  });

  it("returns 0 for null inputs", () => {
    expect(computeIoU(null, { x: 0, y: 0, width: 10, height: 10 })).toBe(0);
    expect(computeIoU({ x: 0, y: 0, width: 10, height: 10 }, null)).toBe(0);
  });

  it("returns 0 for zero-area boxes", () => {
    const a = { x: 0, y: 0, width: 0, height: 0 };
    const b = { x: 0, y: 0, width: 100, height: 100 };
    expect(computeIoU(a, b)).toBe(0);
  });
});

describe("matchBoxesByIoU", () => {
  it("matches overlapping boxes", () => {
    const pred = [box(0, 0, 100, 100)];
    const gt = [box(0, 0, 100, 100)];
    const result = matchBoxesByIoU(pred, gt);

    expect(result.matched).toHaveLength(1);
    expect(result.unmatchedPredicted).toHaveLength(0);
    expect(result.unmatchedGroundTruth).toHaveLength(0);
  });

  it("leaves non-overlapping boxes unmatched", () => {
    const pred = [box(0, 0, 50, 50)];
    const gt = [box(200, 200, 50, 50)];
    const result = matchBoxesByIoU(pred, gt);

    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedPredicted).toHaveLength(1);
    expect(result.unmatchedGroundTruth).toHaveLength(1);
  });

  it("handles multiple boxes with greedy matching", () => {
    const pred = [box(0, 0, 100, 100), box(200, 200, 100, 100)];
    const gt = [box(0, 0, 100, 100), box(200, 200, 100, 100), box(500, 500, 50, 50)];
    const result = matchBoxesByIoU(pred, gt);

    expect(result.matched).toHaveLength(2);
    expect(result.unmatchedPredicted).toHaveLength(0);
    expect(result.unmatchedGroundTruth).toHaveLength(1);
  });

  it("handles empty arrays", () => {
    const result = matchBoxesByIoU([], []);
    expect(result.matched).toHaveLength(0);
  });
});

describe("computePRF1", () => {
  it("computes perfect scores", () => {
    const result = computePRF1(5, 5, 5);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
  });

  it("computes zero when no matches", () => {
    const result = computePRF1(0, 5, 5);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });

  it("handles zero predictions and ground truth", () => {
    const result = computePRF1(0, 0, 0);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });

  it("computes partial scores correctly", () => {
    const result = computePRF1(3, 5, 4);
    expect(result.precision).toBe(0.6);
    expect(result.recall).toBe(0.75);
    expect(result.f1).toBeCloseTo(0.6667, 3);
  });
});

describe("computeObstructionAgreement", () => {
  it("returns null rate for empty pairs", () => {
    const result = computeObstructionAgreement([]);
    expect(result.rate).toBeNull();
  });

  it("computes perfect agreement", () => {
    const pairs = [
      { predicted: { obstructs: true }, groundTruth: { obstructs: true } },
      { predicted: { obstructs: false }, groundTruth: { obstructs: false } },
    ];
    expect(computeObstructionAgreement(pairs).rate).toBe(1);
  });

  it("computes partial agreement", () => {
    const pairs = [
      { predicted: { obstructs: true }, groundTruth: { obstructs: true } },
      { predicted: { obstructs: true }, groundTruth: { obstructs: false } },
    ];
    expect(computeObstructionAgreement(pairs).rate).toBe(0.5);
  });
});

describe("computeSeverityMAE", () => {
  it("returns null for no severity data", () => {
    const result = computeSeverityMAE([{ predicted: {}, groundTruth: {} }]);
    expect(result.mae).toBeNull();
  });

  it("computes zero MAE for identical severity", () => {
    const pairs = [
      { predicted: { severity: 3 }, groundTruth: { severity: 3 } },
    ];
    expect(computeSeverityMAE(pairs).mae).toBe(0);
  });

  it("computes correct MAE", () => {
    const pairs = [
      { predicted: { severity: 1 }, groundTruth: { severity: 3 } },
      { predicted: { severity: 4 }, groundTruth: { severity: 2 } },
    ];
    // |1-3| + |4-2| = 2 + 2 = 4, MAE = 4/2 = 2
    expect(computeSeverityMAE(pairs).mae).toBe(2);
  });
});

describe("computeSceneLevelAgreement", () => {
  it("returns null for missing scenes", () => {
    expect(computeSceneLevelAgreement(null, null).overallRate).toBeNull();
  });

  it("computes perfect agreement", () => {
    const scene = { sidewalkPresent: "yes", surfaceCondition: 2, walkability: 4, overallAccessibility: 3 };
    const result = computeSceneLevelAgreement(scene, scene);
    expect(result.overallRate).toBe(1);
  });

  it("computes partial agreement", () => {
    const a = { sidewalkPresent: "yes", surfaceCondition: 2, walkability: 4, overallAccessibility: 3 };
    const b = { sidewalkPresent: "yes", surfaceCondition: 3, walkability: 4, overallAccessibility: 5 };
    const result = computeSceneLevelAgreement(a, b);
    expect(result.overallRate).toBe(0.5);
    expect(result.fields.sidewalkPresent.match).toBe(true);
    expect(result.fields.surfaceCondition.match).toBe(false);
  });
});

describe("computeReferencePerformance", () => {
  it("computes full metrics for matching annotations", () => {
    const contributor = {
      selectedObjectsID: [box(0, 0, 100, 100, { obstructs: true, severity: 3, comment: "tree" })],
      newObjects: [],
      sceneLevel: { sidewalkPresent: "yes", surfaceCondition: 2, walkability: 4, overallAccessibility: 3 },
    };
    const groundTruth = {
      selectedObjectsID: [box(0, 0, 100, 100, { obstructs: true, severity: 4, comment: "tree" })],
      newObjects: [],
      sceneLevel: { sidewalkPresent: "yes", surfaceCondition: 2, walkability: 4, overallAccessibility: 3 },
    };

    const result = computeReferencePerformance(contributor, groundTruth);

    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
    expect(result.matchedBoxes).toBe(1);
    expect(result.obstructionAgreement.rate).toBe(1);
    expect(result.severityMAE.mae).toBe(1);
    expect(result.sceneLevelAgreement.overallRate).toBe(1);
  });

  it("handles empty annotations", () => {
    const result = computeReferencePerformance(
      { selectedObjectsID: [], newObjects: [], sceneLevel: null },
      { selectedObjectsID: [], newObjects: [], sceneLevel: null }
    );
    expect(result.f1).toBe(0);
    expect(result.matchedBoxes).toBe(0);
  });
});

describe("detectDegenerateFlags", () => {
  function makeAnnotations(count, boxOverrides = {}) {
    return Array.from({ length: count }, () => ({
      selectedObjectsID: [{ obstructs: true, severity: 3, ...boxOverrides }],
      newObjects: [],
      sceneLevel: { sidewalkPresent: "yes", surfaceCondition: 2, walkability: 4, overallAccessibility: 3 },
    }));
  }

  it("returns no flags below minimum image count", () => {
    const flags = detectDegenerateFlags(makeAnnotations(5), []);
    expect(flags).toHaveLength(0);
  });

  it("flags all-yes obstruction pattern", () => {
    const flags = detectDegenerateFlags(makeAnnotations(12, { obstructs: true }), []);
    expect(flags.some((f) => f.type === "all_obstructs_yes")).toBe(true);
  });

  it("flags all-no obstruction pattern", () => {
    const flags = detectDegenerateFlags(makeAnnotations(12, { obstructs: false }), []);
    expect(flags.some((f) => f.type === "all_obstructs_no")).toBe(true);
  });

  it("flags constant severity", () => {
    const flags = detectDegenerateFlags(makeAnnotations(12, { obstructs: true, severity: 3 }), []);
    expect(flags.some((f) => f.type === "constant_severity")).toBe(true);
  });

  it("flags identical scene ratings", () => {
    const flags = detectDegenerateFlags(makeAnnotations(12), []);
    expect(flags.some((f) => f.type === "identical_scene_ratings")).toBe(true);
  });

  it("flags impossibly fast submissions", () => {
    const events = Array.from({ length: 12 }, () => ({ imageDurationMs: 2000 }));
    const flags = detectDegenerateFlags(makeAnnotations(12), events);
    expect(flags.some((f) => f.type === "impossibly_fast")).toBe(true);
  });

  it("does not flag normal varied annotations", () => {
    const annotations = Array.from({ length: 12 }, (_, i) => ({
      selectedObjectsID: [{ obstructs: i % 2 === 0, severity: (i % 5) + 1 }],
      newObjects: [],
      sceneLevel: {
        sidewalkPresent: i % 3 === 0 ? "no" : "yes",
        surfaceCondition: i % 3 === 0 ? null : (i % 4) + 1,
        walkability: (i % 5) + 1,
        overallAccessibility: (i % 5) + 1,
      },
    }));
    const events = Array.from({ length: 12 }, () => ({ imageDurationMs: 30000 }));
    const flags = detectDegenerateFlags(annotations, events);
    expect(flags).toHaveLength(0);
  });
});

describe("not-an-object exclusion", () => {
  const naoBox = (x, y, w, h) => box(x, y, w, h, { comment: "not_an_object", obstructs: false });

  it("computeReferencePerformance ignores not-an-object boxes on both sides", () => {
    const contributor = {
      selectedObjectsID: [
        box(0, 0, 100, 100, { obstructs: true, severity: 3 }),
        naoBox(200, 200, 50, 50),
      ],
      newObjects: [],
      sceneLevel: null,
    };
    const groundTruth = {
      selectedObjectsID: [
        box(0, 0, 100, 100, { obstructs: true, severity: 3 }),
        naoBox(300, 300, 50, 50),
      ],
      newObjects: [],
      sceneLevel: null,
    };
    const result = computeReferencePerformance(contributor, groundTruth);
    expect(result.contributorBoxCount).toBe(1);
    expect(result.groundTruthBoxCount).toBe(1);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
  });

  it("detectDegenerateFlags ignores not-an-object obstructs values", () => {
    const annotations = Array.from({ length: 12 }, (_, i) => ({
      selectedObjectsID: [
        { obstructs: i % 2 === 0, severity: (i % 5) + 1 },
        { comment: "not_an_object", obstructs: false },
      ],
      newObjects: [],
      sceneLevel: {
        sidewalkPresent: i % 3 === 0 ? "no" : "yes",
        surfaceCondition: i % 3 === 0 ? null : (i % 4) + 1,
        walkability: (i % 5) + 1,
        overallAccessibility: (i % 5) + 1,
      },
    }));
    const flags = detectDegenerateFlags(annotations, []);
    expect(flags.some((f) => f.type === "all_obstructs_no")).toBe(false);
  });

  it("computePairwiseAgreement ignores not-an-object boxes", () => {
    const a = {
      selectedObjectsID: [
        box(0, 0, 100, 100, { obstructs: true }),
        naoBox(200, 200, 50, 50),
      ],
      newObjects: [],
      sceneLevel: null,
    };
    const b = {
      selectedObjectsID: [box(0, 0, 100, 100, { obstructs: true })],
      newObjects: [],
      sceneLevel: null,
    };
    const result = computePairwiseAgreement(a, b);
    expect(result.f1).toBe(1);
  });
});

describe("computePairwiseAgreement", () => {
  it("computes agreement for two contributor annotations on same image", () => {
    const a = {
      selectedObjectsID: [box(0, 0, 100, 100, { obstructs: true })],
      newObjects: [],
      sceneLevel: { sidewalkPresent: "yes", surfaceCondition: 2, walkability: 4, overallAccessibility: 3 },
    };
    const b = {
      selectedObjectsID: [box(5, 5, 100, 100, { obstructs: true })],
      newObjects: [],
      sceneLevel: { sidewalkPresent: "yes", surfaceCondition: 2, walkability: 4, overallAccessibility: 3 },
    };
    const result = computePairwiseAgreement(a, b);
    expect(result.f1).toBeGreaterThan(0);
    expect(result.obstructionAgreement.rate).toBe(1);
    expect(result.sceneLevelAgreement.overallRate).toBe(1);
  });
});
