import { describe, it, expect } from "vitest";
import { bucketChartData, normalizeCityDisplay } from "./recentSessions.js";

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

  it("passes through other slugs", () => {
    expect(normalizeCityDisplay("makati")).toBe("makati");
    expect(normalizeCityDisplay("manila")).toBe("manila");
  });

  it("returns Unknown for non-string input", () => {
    expect(normalizeCityDisplay(null)).toBe("Unknown");
    expect(normalizeCityDisplay(undefined)).toBe("Unknown");
  });
});
