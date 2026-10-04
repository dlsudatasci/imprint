import { describe, it, expect } from "vitest";
import {
  normalizeMark,
  clampMark,
  markArea,
  modelCopyArea,
  isBelowMinimumSize,
  MODEL_COPY_SIZE,
  MIN_MODEL_AREA_PX,
} from "./boxGeometry.js";

describe("normalizeMark", () => {
  const expected = { type: "RECT", x: 10, y: 20, width: 30, height: 40 };

  it("leaves a box drawn down and to the right unchanged", () => {
    expect(normalizeMark({ type: "RECT", x: 10, y: 20, width: 30, height: 40 })).toEqual(expected);
  });

  it("fixes a box drawn to the left (negative width)", () => {
    expect(normalizeMark({ type: "RECT", x: 40, y: 20, width: -30, height: 40 })).toEqual(expected);
  });

  it("fixes a box drawn up (negative height)", () => {
    expect(normalizeMark({ type: "RECT", x: 10, y: 60, width: 30, height: -40 })).toEqual(expected);
  });

  it("fixes a box drawn up and to the left", () => {
    expect(normalizeMark({ type: "RECT", x: 40, y: 60, width: -30, height: -40 })).toEqual(expected);
  });

  it("keeps type and other fields, and does not mutate", () => {
    const mark = { type: "RECT", x: 40, y: 60, width: -30, height: -40, extra: 1 };
    const out = normalizeMark(mark);
    expect(out.type).toBe("RECT");
    expect(out.extra).toBe(1);
    expect(mark.width).toBe(-30);
  });
});

describe("clampMark", () => {
  it("clips a box hanging off each edge", () => {
    expect(clampMark({ x: -10, y: 5, width: 30, height: 10 }, 100, 50)).toMatchObject({ x: 0, y: 5, width: 20, height: 10 });
    expect(clampMark({ x: 5, y: -10, width: 10, height: 30 }, 100, 50)).toMatchObject({ x: 5, y: 0, width: 10, height: 20 });
    expect(clampMark({ x: 90, y: 5, width: 30, height: 10 }, 100, 50)).toMatchObject({ x: 90, y: 5, width: 10, height: 10 });
    expect(clampMark({ x: 5, y: 40, width: 10, height: 30 }, 100, 50)).toMatchObject({ x: 5, y: 40, width: 10, height: 10 });
  });

  it("leaves a box inside the image unchanged", () => {
    const mark = { type: "RECT", x: 10, y: 10, width: 20, height: 20 };
    expect(clampMark(mark, 100, 50)).toEqual(mark);
  });

  it("normalizes a negative box before clipping", () => {
    expect(clampMark({ x: 30, y: 30, width: -40, height: -10 }, 100, 50)).toMatchObject({ x: 0, y: 20, width: 30, height: 10 });
  });

  it("gives zero area for a box entirely outside the image", () => {
    expect(markArea(clampMark({ x: 150, y: 10, width: 20, height: 20 }, 100, 50))).toBe(0);
    expect(markArea(clampMark({ x: -50, y: -50, width: 20, height: 20 }, 100, 50))).toBe(0);
  });

  it("returns the mark unchanged when the image size is unknown", () => {
    const mark = { x: -10, y: 5, width: -30, height: 10 };
    expect(clampMark(mark, undefined, 50)).toBe(mark);
    expect(clampMark(mark, 100, 0)).toBe(mark);
    expect(clampMark(mark, NaN, 50)).toBe(mark);
  });
});

describe("minimum size (about 20 by 20 pixels in the 640 by 640 model copy)", () => {
  it("uses the pipeline Step 3 constants", () => {
    expect(MODEL_COPY_SIZE).toBe(640);
    expect(MIN_MODEL_AREA_PX).toBe(400);
  });

  it("scales a 1280 by 960 Mapillary image by one half", () => {
    expect(modelCopyArea({ x: 0, y: 0, width: 40, height: 40 }, 1280, 960)).toBe(400);
    expect(isBelowMinimumSize({ x: 0, y: 0, width: 40, height: 40 }, 1280, 960)).toBe(false);
    expect(isBelowMinimumSize({ x: 0, y: 0, width: 39, height: 40 }, 1280, 960)).toBe(true);
  });

  it("keeps a 640 by 360 ATLAS-3 image at full scale", () => {
    expect(isBelowMinimumSize({ x: 0, y: 0, width: 20, height: 20 }, 640, 360)).toBe(false);
    expect(isBelowMinimumSize({ x: 0, y: 0, width: 19, height: 20 }, 640, 360)).toBe(true);
  });

  it("keeps a thin pole, since the minimum is an area", () => {
    expect(isBelowMinimumSize({ x: 0, y: 0, width: 8, height: 60 }, 640, 360)).toBe(false);
  });

  it("measures a negative-size box by its absolute size", () => {
    expect(isBelowMinimumSize({ x: 40, y: 40, width: -20, height: -20 }, 640, 360)).toBe(false);
  });

  it("is false when the image size is unknown", () => {
    expect(isBelowMinimumSize({ x: 0, y: 0, width: 1, height: 1 }, undefined, undefined)).toBe(false);
    expect(isBelowMinimumSize({ x: 0, y: 0, width: 1, height: 1 }, 0, 360)).toBe(false);
  });
});
