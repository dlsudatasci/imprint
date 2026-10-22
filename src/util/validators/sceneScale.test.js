import { describe, it, expect } from "vitest";
import { SCENE_SCALE, SCENE_SCALE_TOP, flipAnswer, toCurrentScale, sceneAnswersOf, currentScaleExpr } from "./sceneScale.mjs";

// 22 Oct 2026: Step 2's numbered answers run worst to best, higher is better
describe("flipAnswer", () => {
  it("turns an old-scale answer around", () => {
    expect([1, 2, 3, 4, 5].map((n) => flipAnswer(n, 5))).toEqual([5, 4, 3, 2, 1]);
    expect([1, 2, 3].map((n) => flipAnswer(n, 3))).toEqual([3, 2, 1]);
    expect(flipAnswer("2", 3)).toBe(2);
  });

  it("leaves what is not one of the scale's whole numbers alone", () => {
    for (const v of [null, undefined, 0, 6, 2.5, "x", true]) expect(flipAnswer(v, 5)).toBe(v);
  });
});

describe("toCurrentScale", () => {
  const old = { sidewalkWidth: "two_people", surfaceCondition: 1, walkability: 3, overallAccessibility: 2 };

  it("flips an old row's numbered answers and keeps the width", () => {
    expect(toCurrentScale(old, undefined)).toEqual({ sidewalkWidth: "two_people", surfaceCondition: 3, walkability: 1, overallAccessibility: 4 });
    // The row it was given is not changed
    expect(old.surfaceCondition).toBe(1);
  });

  it("leaves a new row as it is", () => {
    expect(toCurrentScale(old, SCENE_SCALE)).toBe(old);
  });

  it("keeps the empty answers of a photo with no sidewalk", () => {
    const none = { sidewalkWidth: "no_sidewalk", surfaceCondition: null, walkability: null, overallAccessibility: null };
    expect(toCurrentScale(none)).toEqual(none);
  });

  it("is null for no answers", () => {
    expect(toCurrentScale(null)).toBeNull();
    expect(toCurrentScale(undefined, SCENE_SCALE)).toBeNull();
    expect(sceneAnswersOf(null)).toBeNull();
    expect(sceneAnswersOf({ sceneLevel: null })).toBeNull();
  });

  it("reads a record's own sceneScale", () => {
    expect(sceneAnswersOf({ sceneLevel: { overallAccessibility: 1 } })).toEqual({ overallAccessibility: 5 });
    expect(sceneAnswersOf({ sceneLevel: { overallAccessibility: 1 }, sceneScale: SCENE_SCALE })).toEqual({ overallAccessibility: 1 });
  });
});

describe("currentScaleExpr", () => {
  it("flips unmarked rows in the database the way toCurrentScale does", () => {
    expect(currentScaleExpr("overallAccessibility")).toEqual({
      $cond: [
        { $eq: ["$sceneScale", 2] },
        "$sceneLevel.overallAccessibility",
        { $cond: [{ $isNumber: "$sceneLevel.overallAccessibility" }, { $subtract: [6, "$sceneLevel.overallAccessibility"] }, null] },
      ],
    });
    expect(JSON.stringify(currentScaleExpr("walkability"))).toContain("[4,");
  });

  it("refuses a field that is not a numbered answer", () => {
    expect(() => currentScaleExpr("sidewalkWidth")).toThrow();
    expect(Object.keys(SCENE_SCALE_TOP)).toEqual(["surfaceCondition", "walkability", "overallAccessibility"]);
  });
});
