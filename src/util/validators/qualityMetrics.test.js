import { describe, it, expect } from "vitest";
import { normalizeMark } from "@/util/boxGeometry";
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
  buildReferenceStandard,
  scoreAgainstStandard,
  computeReferencePerformanceAgainstTeam,
  latestAnnotatorEntries,
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

  it("compares only pairs where both sides answered Yes or No (4 Oct 2026)", () => {
    const pairs = [
      { predicted: { obstructs: true }, groundTruth: { obstructs: true } },
      { predicted: { obstructs: false }, groundTruth: { obstructs: null } },
      { predicted: { obstructs: true }, groundTruth: {} },
      { predicted: { obstructs: false }, groundTruth: { obstructs: true } },
    ];
    expect(computeObstructionAgreement(pairs)).toEqual({ rate: 0.5, agreed: 1, total: 2 });
  });

  it("returns rate null when no pair has an answer on both sides", () => {
    const pairs = [
      { predicted: { obstructs: true }, groundTruth: { obstructs: null } },
      { predicted: { obstructs: null }, groundTruth: { obstructs: null } },
    ];
    expect(computeObstructionAgreement(pairs)).toEqual({ rate: null, agreed: 0, total: 0 });
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
    const scene = { sidewalkWidth: "two_people", surfaceCondition: 2, walkability: 3, overallAccessibility: 3 };
    const result = computeSceneLevelAgreement(scene, scene);
    expect(result.overallRate).toBe(1);
  });

  it("computes partial agreement", () => {
    const a = { sidewalkWidth: "two_people", surfaceCondition: 2, walkability: 3, overallAccessibility: 3 };
    const b = { sidewalkWidth: "two_people", surfaceCondition: 3, walkability: 3, overallAccessibility: 5 };
    const result = computeSceneLevelAgreement(a, b);
    expect(result.overallRate).toBe(0.5);
    expect(result.fields.sidewalkWidth.match).toBe(true);
    expect(result.fields.surfaceCondition.match).toBe(false);
  });

  it("compares the sidewalk width answer (2 Oct 2026)", () => {
    const a = { sidewalkWidth: "one_person", surfaceCondition: 2, walkability: 1, overallAccessibility: 1 };
    const b = { ...a, sidewalkWidth: "three_or_more" };
    const result = computeSceneLevelAgreement(a, b);
    expect(result.fields.sidewalkWidth).toEqual({ a: "one_person", b: "three_or_more", match: false });
    expect(result.overallRate).toBe(0.75);
  });

  it("counts None against a sidewalk once, and skips the questions only one of them answered", () => {
    const none = { sidewalkWidth: "no_sidewalk", surfaceCondition: null, walkability: null, overallAccessibility: null };
    const narrow = { sidewalkWidth: "one_person", surfaceCondition: 2, walkability: 1, overallAccessibility: 1 };
    const result = computeSceneLevelAgreement(none, narrow);
    expect(Object.keys(result.fields)).toEqual(["sidewalkWidth"]);
    expect(result.overallRate).toBe(0);
  });

  it("treats two None answers as full agreement", () => {
    const none = { sidewalkWidth: "no_sidewalk", surfaceCondition: null, walkability: null, overallAccessibility: null };
    const result = computeSceneLevelAgreement(none, { ...none });
    expect(result.overallRate).toBe(1);
    expect(Object.keys(result.fields)).toEqual(["sidewalkWidth"]);
  });
});

describe("computeReferencePerformance", () => {
  it("computes full metrics for matching annotations", () => {
    const contributor = {
      selectedObjectsID: [box(0, 0, 100, 100, { obstructs: true, severity: 3, comment: "tree" })],
      newObjects: [],
      sceneLevel: { sidewalkWidth: "two_people", surfaceCondition: 2, walkability: 3, overallAccessibility: 3 },
    };
    const groundTruth = {
      selectedObjectsID: [box(0, 0, 100, 100, { obstructs: true, severity: 4, comment: "tree" })],
      newObjects: [],
      sceneLevel: { sidewalkWidth: "two_people", surfaceCondition: 2, walkability: 3, overallAccessibility: 3 },
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
      sceneLevel: { sidewalkWidth: "two_people", surfaceCondition: 2, walkability: 3, overallAccessibility: 3 },
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

  it("does not flag identical scene ratings when only the sidewalk width varies (2 Oct 2026)", () => {
    const widths = ["one_person", "two_people", "three_or_more"];
    const annotations = makeAnnotations(12).map((a, i) => ({
      ...a,
      selectedObjectsID: [{ obstructs: i % 2 === 0, severity: (i % 5) + 1 }],
      sceneLevel: { ...a.sceneLevel, sidewalkWidth: widths[i % 3] },
    }));
    const flags = detectDegenerateFlags(annotations, []);
    expect(flags.some((f) => f.type === "identical_scene_ratings")).toBe(false);
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
        sidewalkWidth: i % 3 === 0 ? "no_sidewalk" : "two_people",
        surfaceCondition: i % 3 === 0 ? null : (i % 3) + 1,
        walkability: i % 3 === 0 ? null : (i % 2) + 1,
        overallAccessibility: i % 3 === 0 ? null : (i % 2) + 2,
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
        sidewalkWidth: i % 3 === 0 ? "no_sidewalk" : "two_people",
        surfaceCondition: i % 3 === 0 ? null : (i % 3) + 1,
        walkability: i % 3 === 0 ? null : (i % 2) + 1,
        overallAccessibility: i % 3 === 0 ? null : (i % 2) + 2,
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
      sceneLevel: { sidewalkWidth: "two_people", surfaceCondition: 2, walkability: 3, overallAccessibility: 3 },
    };
    const b = {
      selectedObjectsID: [box(5, 5, 100, 100, { obstructs: true })],
      newObjects: [],
      sceneLevel: { sidewalkWidth: "two_people", surfaceCondition: 2, walkability: 3, overallAccessibility: 3 },
    };
    const result = computePairwiseAgreement(a, b);
    expect(result.f1).toBeGreaterThan(0);
    expect(result.obstructionAgreement.rate).toBe(1);
    expect(result.sceneLevelAgreement.overallRate).toBe(1);
  });
});

/* Option B answer key (2 Oct 2026, pipeline_methodology.md 7l). */
const ann = (boxes, sceneLevel = null) => ({ selectedObjectsID: [], newObjects: boxes, sceneLevel });
const tree = (x, extra = {}) => box(x, 0, 100, 100, { comment: "tree", obstructs: false, ...extra });
const car = (x, extra = {}) => box(x, 0, 100, 100, { comment: "car", obstructs: false, ...extra });

describe("computeIoU on normalized marks (4 Oct 2026)", () => {
  it("gives the same result for boxes stored with negative sizes once normalized", () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 50, y: 50, width: 100, height: 100 };
    const aFlipped = { x: 100, y: 100, width: -100, height: -100 };
    const bFlipped = { x: 150, y: 50, width: -100, height: 100 };
    const expected = computeIoU(a, b);
    expect(expected).toBeGreaterThan(0);
    expect(computeIoU(normalizeMark(aFlipped), normalizeMark(bFlipped))).toBeCloseTo(expected);
    // Without normalizing, the flipped boxes do not register an overlap
    expect(computeIoU(aFlipped, bFlipped)).not.toBeCloseTo(expected);
  });
});

describe("buildReferenceStandard", () => {
  it("keeps an object boxed by more than half of the annotators, with median edges and majority category", () => {
    const std = buildReferenceStandard([
      ann([box(0, 0, 100, 100, { comment: "tree" })]),
      ann([box(10, 0, 100, 100, { comment: "tree" })]),
      ann([box(20, 0, 100, 100, { comment: "car" })]),
    ]);
    expect(std.annotatorCount).toBe(3);
    expect(std.objects).toHaveLength(1);
    expect(std.objects[0]).toEqual({ mark: { x: 10, y: 0, width: 100, height: 100 }, comment: "tree", votes: 3 });
    expect(std.uncertain).toHaveLength(0);
  });

  it("sets aside an object boxed by half or fewer as uncertain", () => {
    const std = buildReferenceStandard([ann([tree(0)]), ann([tree(5)]), ann([]), ann([])]);
    expect(std.objects).toHaveLength(0);
    expect(std.uncertain).toEqual([expect.objectContaining({ votes: 2, reason: "minority" })]);
  });

  it("sets aside a majority object whose category is tied, and counts the tie", () => {
    const std = buildReferenceStandard([ann([tree(0)]), ann([car(0)]), ann([tree(0)]), ann([car(0)])]);
    expect(std.objects).toHaveLength(0);
    expect(std.ties).toBe(1);
    expect(std.uncertain[0].reason).toBe("category_tie");
  });

  it("takes at most one box from each annotator per object", () => {
    // Annotator 1 drew two overlapping boxes. Only one can join annotator 2's object.
    const std = buildReferenceStandard([ann([tree(0), tree(10)]), ann([tree(5)])]);
    expect(std.objects).toHaveLength(1);
    expect(std.objects[0].votes).toBe(2);
    expect(std.uncertain).toEqual([expect.objectContaining({ votes: 1, reason: "minority" })]);
  });

  it("leaves out Not an object boxes", () => {
    const std = buildReferenceStandard([
      ann([box(0, 0, 100, 100, { comment: "not_an_object", obstructs: false })]),
      ann([box(0, 0, 100, 100, { comment: "not_an_object", obstructs: false })]),
    ]);
    expect(std.objects).toHaveLength(0);
    expect(std.uncertain).toHaveLength(0);
  });

  it("treats spaces and underscores in categories alike", () => {
    const std = buildReferenceStandard([
      ann([box(0, 0, 100, 100, { comment: "lamp post" })]),
      ann([box(0, 0, 100, 100, { comment: "lamp_post" })]),
    ]);
    expect(std.objects[0].comment).toBe("lamp_post");
  });
});

describe("scoreAgainstStandard", () => {
  const std = buildReferenceStandard([
    ann([tree(0), car(300), tree(600)]),
    ann([tree(0), car(300)]),
    ann([tree(5), car(305)]),
  ]); // tree(0) and car(300) are in the key, tree(600) is uncertain

  it("counts a box as correct only when it overlaps and has the same category", () => {
    const r = scoreAgainstStandard(ann([tree(0), tree(300)]), std);
    expect(r).toMatchObject({ truePositives: 1, falsePositives: 1, falseNegatives: 1, ignoredOnUncertain: 0 });
    expect(r.precision).toBe(0.5);
    expect(r.recall).toBe(0.5);
  });

  it("neither rewards nor penalizes a box on an uncertain object", () => {
    const r = scoreAgainstStandard(ann([tree(0), car(300), tree(600)]), std);
    expect(r).toMatchObject({ truePositives: 2, falsePositives: 0, falseNegatives: 0, ignoredOnUncertain: 1 });
    expect(r.f1).toBe(1);
  });

  it("credits a contributor who boxed what most annotators boxed but the first one missed", () => {
    const key = buildReferenceStandard([ann([]), ann([tree(0)]), ann([tree(0)])]);
    expect(scoreAgainstStandard(ann([tree(0)]), key).f1).toBe(1);
  });

  it("returns null scores when neither side has anything to score", () => {
    const empty = buildReferenceStandard([ann([]), ann([])]);
    const r = scoreAgainstStandard(ann([]), empty);
    expect(r).toMatchObject({ precision: null, recall: null, f1: null });
  });
});

describe("computeReferencePerformanceAgainstTeam", () => {
  const scene = (w) => ({ sidewalkWidth: "two_people", surfaceCondition: 1, walkability: w, overallAccessibility: 1 });

  it("averages obstruction agreement across annotators, pairing objects regardless of category", () => {
    const team = [
      ann([tree(0, { obstructs: true, severity: 3 })], scene(1)),
      ann([tree(0, { obstructs: false })], scene(2)),
    ];
    const contributor = ann([car(0, { obstructs: true, severity: 5 })], scene(1));
    const r = computeReferencePerformanceAgainstTeam(contributor, team);
    expect(r.obstructionAgreement).toBe(0.5); // agrees with the first annotator, not the second
    expect(r.f1).toBe(0); // the category does not match the answer key
    expect(r.annotatorCount).toBe(2);
  });

  it("gives obstructionAgreement null while annotators have no obstruction answers, and still scores boxes (4 Oct 2026)", () => {
    const team = [
      ann([tree(0, { obstructs: null }), car(300, { obstructs: null })]),
      ann([tree(0, { obstructs: null }), car(300, { obstructs: null })]),
    ];
    const contributor = ann([tree(0, { obstructs: true, severity: 3 }), car(300, { obstructs: false })], scene(1));
    const r = computeReferencePerformanceAgainstTeam(contributor, team);
    expect(r.obstructionAgreement).toBeNull();
    expect(r.f1).toBe(1);
    expect(r.truePositives).toBe(2);
  });

  it("returns no severity or scene comparison, since annotators record neither (3 Oct 2026)", () => {
    // Annotator entries as stored from 3 Oct 2026: sceneLevel null, severity null
    const team = [
      ann([tree(0, { obstructs: true, severity: null })], null),
      ann([tree(0, { obstructs: true, severity: null })], null),
    ];
    const contributor = ann([tree(0, { obstructs: true, severity: 4 })], scene(1));
    const r = computeReferencePerformanceAgainstTeam(contributor, team);
    expect(r.obstructionAgreement).toBe(1);
    expect(r).not.toHaveProperty("severityMAE");
    expect(r).not.toHaveProperty("sceneAgreement");
    expect(r.f1).toBe(1);
  });
});

describe("latestAnnotatorEntries", () => {
  it("keeps one entry per annotator, the latest, and ignores contributor entries", () => {
    const rows = [
      { userId: "a", source: "annotator", submittedAt: "2026-10-01T00:00:00Z", tag: "old" },
      { userId: "a", source: "annotator", submittedAt: "2026-10-02T00:00:00Z", tag: "new" },
      { userId: "b", source: "annotator", submittedAt: "2026-10-01T00:00:00Z", tag: "b" },
      { userId: "c", source: "contributor", submittedAt: "2026-10-01T00:00:00Z", tag: "c" },
    ];
    expect(latestAnnotatorEntries(rows).map((e) => e.tag).sort()).toEqual(["b", "new"]);
  });
});
