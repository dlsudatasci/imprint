import { describe, it, expect } from "vitest";
import {
  SIDEWALK_MASK_LIMITS,
  requiresSidewalkMask,
  polygonArea,
  isSimplePolygon,
  clampPoint,
  roundPoint,
  normalizeSidewalkMask,
  validateSidewalkMask,
  summarizeSidewalkMask,
} from "./sidewalkMask.js";

const pt = (x, y) => ({ x, y });
const square = (x, y, s) => [pt(x, y), pt(x + s, y), pt(x + s, y + s), pt(x, y + s)];
const walk = (id, points) => ({ id, kind: "walk", points });
const cutout = (id, points) => ({ id, kind: "cutout", points });

const SHAPE_MESSAGE = "A sidewalk shape is not a valid outline. Each shape needs at least three points and its edges must not cross.";

describe("requiresSidewalkMask (6 Oct 2026)", () => {
  it("is true for a model-development image", () => {
    expect(requiresSidewalkMask({ poolStatus: "model_dev", isReference: false })).toBe(true);
    expect(requiresSidewalkMask({ poolStatus: "model_dev" })).toBe(true);
  });

  it("is false for a reference image, even one marked model_dev", () => {
    expect(requiresSidewalkMask({ poolStatus: "served", isReference: true })).toBe(false);
    expect(requiresSidewalkMask({ poolStatus: "model_dev", isReference: true })).toBe(false);
  });

  it("is false for deployment images and a missing image", () => {
    expect(requiresSidewalkMask({ poolStatus: "served", isReference: false })).toBe(false);
    expect(requiresSidewalkMask(null)).toBe(false);
    expect(requiresSidewalkMask(undefined)).toBe(false);
  });

  it("is true for a reference image flagged sidewalkAgreement: true (6 Oct 2026)", () => {
    expect(requiresSidewalkMask({ poolStatus: "served", isReference: true, sidewalkAgreement: true })).toBe(true);
  });

  it("is false for a reference image unless the flag is the literal true", () => {
    expect(requiresSidewalkMask({ poolStatus: "served", isReference: true, sidewalkAgreement: true })).toBe(true);
    for (const sidewalkAgreement of [undefined, false, "true", 1, null]) {
      expect(requiresSidewalkMask({ poolStatus: "served", isReference: true, sidewalkAgreement })).toBe(false);
    }
  });

  it("is true for a model-development image with or without the flag", () => {
    expect(requiresSidewalkMask({ poolStatus: "model_dev", isReference: false, sidewalkAgreement: true })).toBe(true);
    expect(requiresSidewalkMask({ poolStatus: "model_dev", isReference: false, sidewalkAgreement: false })).toBe(true);
  });
});

describe("polygonArea", () => {
  it("measures a square and a triangle in either winding", () => {
    expect(polygonArea(square(0, 0, 10))).toBe(100);
    expect(polygonArea([...square(0, 0, 10)].reverse())).toBe(100);
    expect(polygonArea([pt(0, 0), pt(10, 0), pt(0, 10)])).toBe(50);
  });

  it("is 0 for fewer than three points", () => {
    expect(polygonArea([pt(0, 0), pt(1, 1)])).toBe(0);
  });
});

describe("isSimplePolygon", () => {
  it("accepts a square", () => {
    expect(isSimplePolygon(square(0, 0, 10))).toBe(true);
  });

  it("refuses a bow-tie", () => {
    expect(isSimplePolygon([pt(0, 0), pt(10, 10), pt(10, 0), pt(0, 10)])).toBe(false);
  });

  it("refuses a repeated point and two edges touching at a point", () => {
    expect(isSimplePolygon([pt(0, 0), pt(10, 0), pt(10, 0), pt(0, 10)])).toBe(false);
    // A figure eight whose two loops touch at (5, 5)
    expect(isSimplePolygon([pt(0, 0), pt(5, 5), pt(10, 0), pt(10, 10), pt(5, 5), pt(0, 10)])).toBe(false);
  });

  it("refuses fewer than three points", () => {
    expect(isSimplePolygon([pt(0, 0), pt(1, 1)])).toBe(false);
    expect(isSimplePolygon(undefined)).toBe(false);
  });
});

describe("clampPoint and roundPoint", () => {
  it("clamps to the image, and leaves the point when the size is unknown", () => {
    expect(clampPoint(pt(-5, 700), 640, 360)).toEqual(pt(0, 360));
    expect(clampPoint(pt(-5, 700), undefined, 360)).toEqual(pt(-5, 700));
  });

  it("rounds to two decimals", () => {
    expect(roundPoint(pt(1.23456, 9.87654))).toEqual(pt(1.23, 9.88));
  });
});

describe("normalizeSidewalkMask", () => {
  it("clamps, rounds and drops consecutive duplicate points", () => {
    const mask = { noSidewalk: false, polygons: [walk("w1", [pt(-3, 5.555), pt(700, 5.555), pt(700, 5.555), pt(320.004, 400), pt(-3, 5.555)])] };
    expect(normalizeSidewalkMask(mask, 640, 360).polygons[0].points).toEqual([pt(0, 5.56), pt(640, 5.56), pt(320, 360)]);
  });

  it("keeps null and does not mutate its input", () => {
    expect(normalizeSidewalkMask(null, 640, 360)).toBeNull();
    const mask = { noSidewalk: false, polygons: [walk("w1", [pt(-3, 5), pt(700, 5), pt(320, 400)])] };
    const snapshot = structuredClone(mask);
    normalizeSidewalkMask(mask, 640, 360);
    expect(mask).toEqual(snapshot);
  });
});

describe("validateSidewalkMask", () => {
  // Two walking-space shapes, overlapping (the mask is their union)
  const ok = { noSidewalk: false, polygons: [walk("w1", square(10, 10, 100)), walk("w2", square(80, 40, 100))] };

  it("accepts two walking-space shapes, and a No sidewalk mask", () => {
    expect(validateSidewalkMask(ok, 640, 360)).toEqual({ valid: true });
    expect(validateSidewalkMask({ noSidewalk: true, polygons: [] }, 640, 360)).toEqual({ valid: true });
  });

  it("refuses a cut out, removed on 6 Oct 2026", () => {
    const withCutout = { noSidewalk: false, polygons: [walk("w1", square(10, 10, 100)), cutout("c1", square(40, 40, 20))] };
    expect(validateSidewalkMask(withCutout, 640, 360)).toEqual({ valid: false, message: SHAPE_MESSAGE });
  });

  it("refuses a missing or malformed mask", () => {
    for (const bad of [null, undefined, "x", { polygons: [] }, { noSidewalk: false }]) {
      expect(validateSidewalkMask(bad, 640, 360).message).toBe("Sidewalk outline is missing.");
    }
  });

  it("refuses No sidewalk with shapes, and an outline with no walking space", () => {
    expect(validateSidewalkMask({ noSidewalk: true, polygons: [walk("w1", square(0, 0, 10))] }, 640, 360).message)
      .toBe("Remove the sidewalk shapes or untick No sidewalk.");
    expect(validateSidewalkMask({ noSidewalk: false, polygons: [] }, 640, 360).message)
      .toBe("Outline the sidewalk, or tick No sidewalk if there is none.");
    expect(validateSidewalkMask({ noSidewalk: false, polygons: [cutout("c1", square(0, 0, 10))] }, 640, 360).message)
      .toBe("Outline the sidewalk, or tick No sidewalk if there is none.");
  });

  it("enforces the shape and point limits", () => {
    const many = Array.from({ length: SIDEWALK_MASK_LIMITS.maxPolygons + 1 }, (_, i) => walk(`w${i + 1}`, square(i * 10, 0, 5)));
    expect(validateSidewalkMask({ noSidewalk: false, polygons: many }, 640, 360).message).toBe("The sidewalk outline has too many shapes or points.");
    const ring = Array.from({ length: SIDEWALK_MASK_LIMITS.maxPoints + 1 }, (_, i) => {
      const a = (2 * Math.PI * i) / (SIDEWALK_MASK_LIMITS.maxPoints + 1);
      return pt(200 + 100 * Math.cos(a), 180 + 100 * Math.sin(a));
    });
    expect(validateSidewalkMask({ noSidewalk: false, polygons: [walk("w1", ring)] }, 640, 360).message).toBe("The sidewalk outline has too many shapes or points.");
  });

  it("refuses invalid shapes", () => {
    const cases = [
      [walk("w1", [pt(0, 0), pt(10, 10), pt(10, 0), pt(0, 10)])], // crossing
      [walk("w1", [pt(0, 0), pt(10, 0)])], // two points
      [walk("w1", [pt(0, 0), pt(10, 0), pt(20, 0)])], // no area
      [walk("w1", square(0, 0, 10)), { id: "r1", kind: "road", points: square(50, 50, 10) }], // unknown kind
      [walk("", square(0, 0, 10))], // missing id
      [walk("w1", square(0, 0, 10)), walk("w1", square(50, 50, 10))], // duplicate id
      [walk("w1", [pt(0, 0), pt("10", 0), pt(0, 10)])], // non-numeric point
      [walk("w1", square(600, 300, 100))], // outside the image
    ];
    for (const polygons of cases) {
      expect(validateSidewalkMask({ noSidewalk: false, polygons }, 640, 360).message).toBe(SHAPE_MESSAGE);
    }
  });

  it("skips only the bounds check when the image size is unknown", () => {
    const outside = { noSidewalk: false, polygons: [walk("w1", square(600, 300, 100))] };
    expect(validateSidewalkMask(outside, undefined, undefined)).toEqual({ valid: true });
    const crossing = { noSidewalk: false, polygons: [walk("w1", [pt(0, 0), pt(10, 10), pt(10, 0), pt(0, 10)])] };
    expect(validateSidewalkMask(crossing, undefined, undefined).message).toBe(SHAPE_MESSAGE);
  });
});

describe("summarizeSidewalkMask", () => {
  it("counts shapes and points, with no cut-out count", () => {
    const mask = { noSidewalk: false, polygons: [walk("w1", square(0, 0, 10)), walk("w2", square(20, 0, 10)), walk("w3", [pt(1, 1), pt(2, 1), pt(1, 2)])] };
    expect(summarizeSidewalkMask(mask)).toEqual({ noSidewalk: false, walkCount: 3, pointCount: 11 });
    expect(summarizeSidewalkMask({ noSidewalk: true, polygons: [] })).toEqual({ noSidewalk: true, walkCount: 0, pointCount: 0 });
  });

  it("gives zeros and noSidewalk null when there is no mask", () => {
    expect(summarizeSidewalkMask(null)).toEqual({ noSidewalk: null, walkCount: 0, pointCount: 0 });
  });
});
