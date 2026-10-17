import { describe, it, expect } from "vitest";
import { bucketChartData, normalizeCityDisplay, countObstructions } from "./recentSessions.js";
import { STUDY_CITIES, normalizeCityName } from "@/util/cities";
import { NOT_AN_OBJECT } from "@/util/suggestionJudgment";

describe("bucketChartData", () => {
  it("passes through 5 or fewer items unchanged", () => {
    expect(bucketChartData([1, 2, 3])).toEqual([1, 2, 3]);
    expect(bucketChartData([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
  });

  it("passes through empty array", () => {
    expect(bucketChartData([])).toEqual([]);
  });

  it("returns null/undefined as-is", () => {
    expect(bucketChartData(null)).toBeNull();
    expect(bucketChartData(undefined)).toBeUndefined();
  });

  it("buckets 10 items into 5", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = bucketChartData(data);
    expect(result).toHaveLength(5);
  });

  it("buckets all-zero arrays to all zeros", () => {
    const data = Array(40).fill(0);
    const result = bucketChartData(data);
    expect(result).toEqual([0, 0, 0, 0, 0]);
  });

  it("averages values within each bucket", () => {
    const data = [10, 10, 20, 20, 30, 30, 40, 40, 50, 50];
    const result = bucketChartData(data);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });
});

describe("normalizeCityDisplay", () => {
  it("corrects laspinas to Las Piñas", () => {
    expect(normalizeCityDisplay("laspinas")).toBe("Las Piñas");
  });

  it("names every study city as people write it (17 Oct 2026)", () => {
    expect(normalizeCityDisplay("makati")).toBe("Makati");
    expect(normalizeCityDisplay("quezoncity")).toBe("Quezon City");
    expect(normalizeCityDisplay("paranaque")).toBe("Parañaque");
    expect(normalizeCityDisplay("sanjuan")).toBe("San Juan");
    for (const name of STUDY_CITIES) expect(normalizeCityDisplay(normalizeCityName(name))).toBe(name);
  });

  it("passes through a slug that is not a study city", () => {
    expect(normalizeCityDisplay("somewhere")).toBe("somewhere");
  });

  it("returns Unknown for non-string input", () => {
    expect(normalizeCityDisplay(null)).toBe("Unknown");
    expect(normalizeCityDisplay(undefined)).toBe("Unknown");
  });
});

describe("countObstructions (17 Oct 2026)", () => {
  it("counts only boxes answered Yes, suggestions and drawn boxes alike", () => {
    const annotation = {
      selectedObjectsID: [
        { obstructs: true, comment: "utility_post" },
        { obstructs: false, comment: "tree" },
        { obstructs: false, comment: NOT_AN_OBJECT },
      ],
      newObjects: [{ obstructs: true, comment: "motorcycle" }, { obstructs: null, comment: "car" }],
    };
    expect(countObstructions(annotation)).toBe(2);
  });

  it("is 0 for a missing annotation or one without boxes", () => {
    expect(countObstructions(undefined)).toBe(0);
    expect(countObstructions({})).toBe(0);
  });
});
