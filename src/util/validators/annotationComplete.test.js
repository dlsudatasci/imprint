import { describe, it, expect } from "vitest";
import { sanitizeReportedTotal } from "./annotationComplete.js";

describe("sanitizeReportedTotal", () => {
  it("returns the number for a normal integer", () => {
    expect(sanitizeReportedTotal(10, 5)).toBe(10);
  });

  it("parses a string number", () => {
    expect(sanitizeReportedTotal("10", 5)).toBe(10);
  });

  it("clamps negative to 0", () => {
    expect(sanitizeReportedTotal(-3, 5)).toBe(0);
  });

  it("truncates a float", () => {
    expect(sanitizeReportedTotal(10.7, 5)).toBe(10);
  });

  it("returns fallback for NaN string", () => {
    expect(sanitizeReportedTotal("abc", 5)).toBe(5);
  });

  it("treats null as 0 (Number(null) === 0)", () => {
    expect(sanitizeReportedTotal(null, 5)).toBe(0);
  });

  it("returns fallback for undefined", () => {
    expect(sanitizeReportedTotal(undefined, 5)).toBe(5);
  });

  it("returns fallback for Infinity", () => {
    expect(sanitizeReportedTotal(Infinity, 5)).toBe(5);
  });

  it("returns 0 for zero", () => {
    expect(sanitizeReportedTotal(0, 5)).toBe(0);
  });
});
