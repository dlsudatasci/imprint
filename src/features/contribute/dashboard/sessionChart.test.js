import { describe, it, expect } from "vitest";
import { chartColumns, chartSummary, MAX_CHART_COLUMNS } from "./sessionChart";

const one = (n, value) => ({ from: n, to: n, value, mean: value });

describe("chartColumns (22 Oct 2026)", () => {
  it("gives every photo its own column up to ten, numbered from 1, in order", () => {
    expect(MAX_CHART_COLUMNS).toBe(10);
    expect(chartColumns([2, 0, 1])).toEqual([one(1, 2), one(2, 0), one(3, 1)]);
    expect(chartColumns(Array(10).fill(1))).toHaveLength(10);
  });

  it("groups neighbouring photos into ten past ten, keeping the total", () => {
    // Every session size there is past ten: 20 and 40 for contributors, 25 and 50 for annotators
    for (const size of [11, 20, 25, 40, 50, 101]) {
      const counts = Array.from({ length: size }, (_, i) => i % 3);
      const columns = chartColumns(counts);
      expect(columns).toHaveLength(MAX_CHART_COLUMNS);
      expect(columns[0].from).toBe(1);
      expect(columns.at(-1).to).toBe(size);
      // Contiguous, none empty, as even as they divide
      for (let i = 1; i < columns.length; i++) expect(columns[i].from).toBe(columns[i - 1].to + 1);
      const sizes = columns.map((c) => c.to - c.from + 1);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(columns.reduce((a, c) => a + c.value, 0)).toBe(counts.reduce((a, b) => a + b, 0));
    }
  });

  it("makes a grouped column as tall as its photos' average, and says its total", () => {
    // 25 photos: groups of 2 and 3
    const columns = chartColumns(Array(25).fill(2));
    expect(columns.every((c) => c.mean === 2)).toBe(true);
    expect(columns[0]).toEqual({ from: 1, to: 2, value: 4, mean: 2 });
    expect(columns[1]).toEqual({ from: 3, to: 5, value: 6, mean: 2 });
  });

  it("treats anything that is not a count as none", () => {
    expect(chartColumns([1, null, "2", -3, Number.NaN])).toEqual([one(1, 1), one(2, 0), one(3, 2), one(4, 0), one(5, 0)]);
    expect(chartColumns(null)).toEqual([]);
  });
});

describe("chartSummary", () => {
  it("totals the session and finds the tallest column, the first of a tie", () => {
    expect(chartSummary([1, 3, 0, 3])).toEqual({ total: 7, photos: 4, peak: one(2, 3) });
  });

  it("finds the tallest by average when photos are grouped", () => {
    // Photos 1 to 2 hold 4 (2 each), photos 3 to 5 hold 5 (fewer each)
    const counts = [2, 2, 2, 2, 1, ...Array(20).fill(0)];
    const { peak, total, photos } = chartSummary(counts);
    expect([total, photos]).toEqual([9, 25]);
    expect(peak).toEqual({ from: 1, to: 2, value: 4, mean: 2 });
  });

  it("has no peak when nothing obstructed", () => {
    expect(chartSummary([0, 0, 0])).toEqual({ total: 0, photos: 3, peak: null });
    expect(chartSummary([])).toEqual({ total: 0, photos: 0, peak: null });
  });
});
