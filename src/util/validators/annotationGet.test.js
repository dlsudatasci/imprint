import { describe, it, expect } from "vitest";
import {
  ALLOWED_SESSION_SIZES,
  ANNOTATOR_SESSION_SIZES,
  ensureModelVersion,
  calculateReferenceCount,
} from "./annotationGet.js";

describe("session size constants", () => {
  it("contributor sizes are [5, 10, 20, 40]", () => {
    expect(ALLOWED_SESSION_SIZES).toEqual([5, 10, 20, 40]);
  });

  it("annotator sizes are [10, 25, 50]", () => {
    expect(ANNOTATOR_SESSION_SIZES).toEqual([10, 25, 50]);
  });

  it("rejects invalid contributor size", () => {
    expect(ALLOWED_SESSION_SIZES.includes(15)).toBe(false);
    expect(ALLOWED_SESSION_SIZES.includes(80)).toBe(false);
  });

  it("rejects invalid annotator size", () => {
    expect(ANNOTATOR_SESSION_SIZES.includes(5)).toBe(false);
    expect(ANNOTATOR_SESSION_SIZES.includes(100)).toBe(false);
  });
});

describe("ensureModelVersion", () => {
  it("fills missing modelVersion with v0-mapillary", () => {
    const records = [{ imageID: 1 }, { imageID: 2 }];
    ensureModelVersion(records);
    expect(records[0].modelVersion).toBe("v0-mapillary");
    expect(records[1].modelVersion).toBe("v0-mapillary");
  });

  it("preserves existing modelVersion", () => {
    const records = [{ imageID: 1, modelVersion: "v1-custom" }];
    ensureModelVersion(records);
    expect(records[0].modelVersion).toBe("v1-custom");
  });

  it("handles mixed records", () => {
    const records = [
      { imageID: 1, modelVersion: "v1-custom" },
      { imageID: 2 },
    ];
    ensureModelVersion(records);
    expect(records[0].modelVersion).toBe("v1-custom");
    expect(records[1].modelVersion).toBe("v0-mapillary");
  });

  it("handles empty array", () => {
    const records = [];
    ensureModelVersion(records);
    expect(records).toEqual([]);
  });
});

describe("calculateReferenceCount", () => {
  it("returns 1 for 5 images (Math.round(5/8) = 1)", () => {
    expect(calculateReferenceCount(5)).toBe(1);
  });

  it("returns 1 for 10 images (Math.round(10/8) = 1)", () => {
    expect(calculateReferenceCount(10)).toBe(1);
  });

  it("returns 3 for 20 images (Math.round(20/8) = 3)", () => {
    expect(calculateReferenceCount(20)).toBe(3);
  });

  it("returns 5 for 40 images (Math.round(40/8) = 5)", () => {
    expect(calculateReferenceCount(40)).toBe(5);
  });

  it("returns at least 1 even for small counts", () => {
    expect(calculateReferenceCount(1)).toBe(1);
    expect(calculateReferenceCount(0)).toBe(1);
  });

  it("returns 10 for 80 images", () => {
    expect(calculateReferenceCount(80)).toBe(10);
  });
});
