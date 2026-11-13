import { describe, it, expect } from "vitest";
import {
  SIDEWALK_WIDTH_OPTIONS,
  SURFACE_TYPE_OPTIONS,
  SCENE_NUMBERED,
  SCENE_KEYS,
  SIDEWALK_ONLY_KEYS,
  emptySceneLevel,
  requiredSceneKeys,
  sceneProgress,
  EVENNESS_OPTIONS,
  isSceneAnswered,
} from "./sceneQuestions.mjs";
import * as sceneQuestions from "./sceneQuestions.mjs";
import { SCENE_SCALE_TOP } from "./sceneScale.mjs";

/**
 * Step 3's question set (S15, 9 Nov 2026), the one place its rules live:
 * six questions for a sidewalk, Ease of Navigation and Evenness for a path.
 */
describe("sceneQuestions.mjs", () => {
  it("names the six questions in the order shown, and the four asked only of a sidewalk", () => {
    expect(SCENE_KEYS).toEqual(["sidewalkWidth", "overallAccessibility", "surfaceEvenness", "surfaceType", "surfaceCondition", "roadBarrier"]);
    expect(SIDEWALK_ONLY_KEYS).toEqual(["sidewalkWidth", "surfaceType", "surfaceCondition", "roadBarrier"]);
    for (const key of SIDEWALK_ONLY_KEYS) expect(SCENE_KEYS).toContain(key);
    expect(Object.isFrozen(SCENE_KEYS)).toBe(true);
    expect(Object.isFrozen(SIDEWALK_ONLY_KEYS)).toBe(true);
  });

  it("keeps the width's stored words without no_sidewalk, and the four surface types", () => {
    expect(SIDEWALK_WIDTH_OPTIONS).toEqual(["one_person", "two_people", "three_or_more"]);
    expect(SIDEWALK_WIDTH_OPTIONS).not.toContain("no_sidewalk");
    expect(SURFACE_TYPE_OPTIONS).toEqual(["concrete", "tiles", "pavers", "unpaved"]);
  });

  it("gives the top of each numbered scale, surfaceEvenness never on the old one", () => {
    expect(SCENE_NUMBERED).toEqual({ overallAccessibility: 5, surfaceEvenness: 3, surfaceCondition: 3 });
    expect(SCENE_SCALE_TOP).not.toHaveProperty("surfaceEvenness");
  });

  it("starts empty with exactly the six keys, a new object each time", () => {
    const a = emptySceneLevel();
    expect(a).toEqual({ sidewalkWidth: null, overallAccessibility: null, surfaceEvenness: null, surfaceType: null, surfaceCondition: null, roadBarrier: null });
    expect(Object.keys(a)).toEqual([...SCENE_KEYS]);
    a.roadBarrier = true;
    expect(emptySceneLevel().roadBarrier).toBeNull();
  });

  it("requires all six for a sidewalk or before Step 1 is answered, and two for a path", () => {
    expect(requiredSceneKeys(true)).toEqual([...SCENE_KEYS]);
    expect(requiredSceneKeys()).toEqual([...SCENE_KEYS]);
    expect(requiredSceneKeys(null)).toEqual([...SCENE_KEYS]);
    expect(requiredSceneKeys(false)).toEqual(["overallAccessibility", "surfaceEvenness"]);
  });

  it("counts what is answered, null and undefined as not, false as an answer", () => {
    expect(sceneProgress(null, true)).toEqual({ answered: 0, required: 6 });
    expect(sceneProgress({ roadBarrier: false, surfaceType: "tiles" }, true)).toEqual({ answered: 2, required: 6 });
    const all = { sidewalkWidth: "two_people", overallAccessibility: 1, surfaceEvenness: 2, surfaceType: "unpaved", surfaceCondition: 1, roadBarrier: false };
    expect(sceneProgress(all, true)).toEqual({ answered: 6, required: 6 });
    expect(sceneProgress({ ...all, surfaceEvenness: undefined }, true)).toEqual({ answered: 5, required: 6 });
    // A path counts only its two, whatever the others hold
    expect(sceneProgress(all, false)).toEqual({ answered: 2, required: 2 });
    expect(sceneProgress({ overallAccessibility: 3 }, false)).toEqual({ answered: 1, required: 2 });
    expect(sceneProgress(undefined, false)).toEqual({ answered: 0, required: 2 });
  });

  // S27 (13 Nov 2026): Evenness offers Sloped (2) and Flat (3). 1 (Uneven, 9 to 13 Nov 2026) is in stored rows only.
  it("offers Evenness 2 and 3 only, and keeps 3 as the top of its scale", () => {
    expect(EVENNESS_OPTIONS).toEqual([2, 3]);
    expect(Object.isFrozen(EVENNESS_OPTIONS)).toBe(true);
    expect(SCENE_NUMBERED.surfaceEvenness).toBe(3);
  });

  it("counts Evenness 2 and 3 as answered, and 1, null and undefined as not", () => {
    expect(isSceneAnswered("surfaceEvenness", 2)).toBe(true);
    expect(isSceneAnswered("surfaceEvenness", 3)).toBe(true);
    for (const v of [1, null, undefined]) expect(isSceneAnswered("surfaceEvenness", v)).toBe(false);
  });

  it("counts any other given answer, false and 1 included, and null or undefined as not", () => {
    expect(isSceneAnswered("roadBarrier", false)).toBe(true);
    expect(isSceneAnswered("overallAccessibility", 1)).toBe(true);
    expect(isSceneAnswered("surfaceCondition", 1)).toBe(true);
    expect(isSceneAnswered("surfaceType", "pavers")).toBe(true);
    for (const key of SCENE_KEYS.filter((k) => k !== "surfaceEvenness")) {
      expect(isSceneAnswered(key, null)).toBe(false);
      expect(isSceneAnswered(key, undefined)).toBe(false);
    }
  });

  it("leaves a stored Evenness 1 out of the progress count", () => {
    const all = { sidewalkWidth: "two_people", overallAccessibility: 1, surfaceEvenness: 1, surfaceType: "unpaved", surfaceCondition: 1, roadBarrier: false };
    expect(sceneProgress(all, true)).toEqual({ answered: 5, required: 6 });
    expect(sceneProgress(all, false)).toEqual({ answered: 1, required: 2 });
  });

  it("has no question set version: nothing reads old and new answers side by side", () => {
    expect(sceneQuestions).not.toHaveProperty("SCENE_QUESTIONS_VERSION");
  });
});
