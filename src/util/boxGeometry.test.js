import { describe, it, expect } from "vitest";
import {
  normalizeMark,
  clampMark,
  markArea,
  modelCopyArea,
  isBelowMinimumSize,
  isTooSmallToKeep,
  pointInsideMark,
  distanceToMark,
  pickNearSmallBox,
  SMALL_BOX_CANVAS_PX,
  NEAR_HIT_CANVAS_PX,
  MODEL_COPY_SIZE,
  MIN_MODEL_AREA_PX,
  MIN_DRAWN_BOX_CANVAS_PX,
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

// Accidental slivers (6 Oct 2026, both roles)
describe("isTooSmallToKeep", () => {
  it("discards a box thinner than 5 screen pixels in either direction", () => {
    expect(MIN_DRAWN_BOX_CANVAS_PX).toBe(5);
    expect(isTooSmallToKeep({ x: 0, y: 0, width: 4, height: 100 }, 1)).toBe(true);
    expect(isTooSmallToKeep({ x: 0, y: 0, width: 100, height: 4.9 }, 1)).toBe(true);
    expect(isTooSmallToKeep({ x: 0, y: 0, width: 5, height: 5 }, 1)).toBe(false);
  });

  it("measures in screen pixels, so the image-to-canvas scale matters", () => {
    // 6 image pixels at a 0.75 scale is 4.5 screen pixels
    expect(isTooSmallToKeep({ x: 0, y: 0, width: 6, height: 60 }, 0.75)).toBe(true);
    // A thin 8 pixel pole on a 1280 wide image (scale 0.75) is kept
    expect(isTooSmallToKeep({ x: 0, y: 0, width: 8, height: 60 }, 0.75)).toBe(false);
    expect(isTooSmallToKeep({ x: 0, y: 0, width: 4, height: 60 }, 1.5)).toBe(false);
  });

  it("measures a box drawn up or to the left by its size, and treats a bad scale as 1", () => {
    expect(isTooSmallToKeep({ x: 50, y: 50, width: -30, height: -30 }, 1)).toBe(false);
    expect(isTooSmallToKeep({ x: 50, y: 50, width: -3, height: -30 }, 1)).toBe(true);
    expect(isTooSmallToKeep({ x: 0, y: 0, width: 4, height: 40 }, 0)).toBe(true);
    expect(isTooSmallToKeep({ x: 0, y: 0, width: 10, height: 40 }, undefined)).toBe(false);
  });
});

describe("pointInsideMark", () => {
  const inside = (m, p) => p.x > Math.min(m.x, m.x + m.width) && p.x < Math.max(m.x, m.x + m.width)
    && p.y > Math.min(m.y, m.y + m.height) && p.y < Math.max(m.y, m.y + m.height);

  it("is one pixel inside the top-left corner of a normal box", () => {
    expect(pointInsideMark({ x: 10, y: 20, width: 50, height: 40 })).toEqual({ x: 11, y: 21 });
  });

  it("lands inside a sliver narrower than two pixels", () => {
    const sliver = { x: 10, y: 20, width: 0.6, height: 1.2 };
    const p = pointInsideMark(sliver);
    expect(p).toEqual({ x: 10.3, y: 20.6 });
    expect(inside(sliver, p)).toBe(true);
  });

  it("lands inside a box drawn up and to the left", () => {
    const flipped = { x: 60, y: 60, width: -50, height: -0.5 };
    const p = pointInsideMark(flipped);
    expect(p).toEqual({ x: 11, y: 59.75 });
    expect(inside(flipped, p)).toBe(true);
  });
});

// Selecting small boxes (6 Oct 2026, both roles)
describe("distanceToMark", () => {
  const box = { x: 10, y: 10, width: 20, height: 10 };

  it("is 0 inside the box and on its edge", () => {
    expect(distanceToMark(box, 15, 15)).toBe(0);
    expect(distanceToMark(box, 10, 20)).toBe(0);
  });

  it("measures the gap to the nearest edge or corner", () => {
    expect(distanceToMark(box, 34, 15)).toBe(4);
    expect(distanceToMark(box, 15, 5)).toBe(5);
    expect(distanceToMark(box, 33, 24)).toBe(5);
  });

  it("works for a box drawn up and to the left", () => {
    expect(distanceToMark({ x: 30, y: 20, width: -20, height: -10 }, 34, 15)).toBe(4);
  });
});

describe("pickNearSmallBox", () => {
  const sliver = { x: 100, y: 100, width: 2, height: 30 };
  const big = { x: 200, y: 100, width: 100, height: 100 };

  it("uses a 12 pixel small-box limit and a 6 pixel reach, in screen pixels", () => {
    expect(SMALL_BOX_CANVAS_PX).toBe(12);
    expect(NEAR_HIT_CANVAS_PX).toBe(6);
  });

  it("picks a small box within reach of a click that missed it", () => {
    expect(pickNearSmallBox([big, sliver], 105, 110, 1)).toBe(1);
    expect(pickNearSmallBox([big, sliver], 96, 110, 1)).toBe(1);
  });

  it("ignores a small box out of reach", () => {
    expect(pickNearSmallBox([sliver], 110, 110, 1)).toBeNull();
  });

  it("never picks a large box, so a new box can be drawn right beside one", () => {
    expect(pickNearSmallBox([big], 197, 150, 1)).toBeNull();
  });

  it("measures in screen pixels, so the reach in image pixels depends on the scale", () => {
    // 6 screen pixels is 8 image pixels at a 0.75 scale
    expect(pickNearSmallBox([sliver], 109, 110, 0.75)).toBe(0);
    expect(pickNearSmallBox([sliver], 109, 110, 1)).toBeNull();
    // A 14 image pixel box is 10.5 screen pixels at 0.75, so small, but 21 at 1.5, so not
    const narrow = { x: 100, y: 100, width: 14, height: 40 };
    expect(pickNearSmallBox([narrow], 118, 110, 0.75)).toBe(0);
    expect(pickNearSmallBox([narrow], 118, 110, 1.5)).toBeNull();
  });

  it("picks the nearest of two small boxes", () => {
    const other = { x: 110, y: 100, width: 2, height: 30 };
    expect(pickNearSmallBox([sliver, other], 104, 110, 1)).toBe(0);
    expect(pickNearSmallBox([sliver, other], 108, 110, 1)).toBe(1);
  });
});
