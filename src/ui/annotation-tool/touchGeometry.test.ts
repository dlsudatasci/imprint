import { describe, it, expect } from "vitest";
import {
  clientToStage,
  cssToImage,
  pickCorner,
  moveCorner,
  addBoxPlacement,
  TOUCH_HANDLE_HIT_PX,
  TOUCH_MIN_SIDE_PX,
  ADD_BOX_MIN_SIDE_PX,
} from "./touchGeometry";

/** Geometry for touch on the photo (9 Oct 2026). */
const mark = (x: number, y: number, width: number, height: number) => ({ x, y, width, height, type: "RECT" });

describe("clientToStage", () => {
  it("is the offset from the canvas at scale 1", () => {
    expect(clientToStage(150, 90, { left: 50, top: 40, width: 390, height: 500 }, 390, 500)).toEqual({ x: 100, y: 50 });
  });

  it("undoes a CSS scale of 0.4", () => {
    // A 960 by 600 stage shown 384 by 240
    expect(clientToStage(60, 30, { left: 20, top: 10, width: 384, height: 240 }, 960, 600)).toEqual({ x: 100, y: 50 });
  });
});

describe("cssToImage", () => {
  it("divides by the image scale and the CSS scale", () => {
    expect(cssToImage(16, 0.5, 0.4)).toBe(80);
    expect(cssToImage(16, 2, 1)).toBe(8);
  });
});

describe("pickCorner", () => {
  const box = mark(100, 100, 200, 100);

  it("finds the nearest corner within 22 px, in order top-left, top-right, bottom-right, bottom-left", () => {
    expect(pickCorner(box, { x: 110, y: 112 }, TOUCH_HANDLE_HIT_PX)).toBe(0);
    expect(pickCorner(box, { x: 290, y: 95 }, TOUCH_HANDLE_HIT_PX)).toBe(1);
    expect(pickCorner(box, { x: 315, y: 205 }, TOUCH_HANDLE_HIT_PX)).toBe(2);
    expect(pickCorner(box, { x: 100, y: 222 }, TOUCH_HANDLE_HIT_PX)).toBe(3);
  });

  it("is null beyond 22 px", () => {
    expect(pickCorner(box, { x: 100, y: 123 }, TOUCH_HANDLE_HIT_PX)).toBeNull();
    expect(pickCorner(box, { x: 200, y: 150 }, TOUCH_HANDLE_HIT_PX)).toBeNull();
  });

  it("takes the nearest when two corners are in reach of a small box", () => {
    const small = mark(100, 100, 20, 20);
    expect(pickCorner(small, { x: 104, y: 103 }, TOUCH_HANDLE_HIT_PX)).toBe(0);
    expect(pickCorner(small, { x: 117, y: 103 }, TOUCH_HANDLE_HIT_PX)).toBe(1);
  });

  it("reads a box drawn up and to the left by its real corners", () => {
    expect(pickCorner(mark(300, 200, -200, -100), { x: 100, y: 100 }, 5)).toBe(0);
  });
});

describe("moveCorner", () => {
  const box = mark(100, 100, 200, 100);
  const none = { x: 0, y: 0 };

  it("moves the corner and keeps the opposite corner", () => {
    expect(moveCorner(box, 2, { x: 350, y: 260 }, none, 16)).toMatchObject({ x: 100, y: 100, width: 250, height: 160 });
    expect(moveCorner(box, 0, { x: 80, y: 60 }, none, 16)).toMatchObject({ x: 80, y: 60, width: 220, height: 140 });
    expect(moveCorner(box, 1, { x: 320, y: 90 }, none, 16)).toMatchObject({ x: 100, y: 90, width: 220, height: 110 });
    expect(moveCorner(box, 3, { x: 90, y: 230 }, none, 16)).toMatchObject({ x: 90, y: 100, width: 210, height: 130 });
  });

  it("keeps the offset between the finger and the corner at the press", () => {
    // Pressed 10 px right of and 6 px below the bottom-right corner
    const grab = { x: 10, y: 6 };
    expect(moveCorner(box, 2, { x: 330, y: 226 }, grab, 16)).toMatchObject({ width: 220, height: 120 });
  });

  it("stops 16 px short of the opposite sides, so the box never flips", () => {
    expect(moveCorner(box, 2, { x: 20, y: 20 }, none, TOUCH_MIN_SIDE_PX)).toMatchObject({ x: 100, y: 100, width: 16, height: 16 });
    expect(moveCorner(box, 0, { x: 900, y: 900 }, none, TOUCH_MIN_SIDE_PX)).toMatchObject({ x: 284, y: 184, width: 16, height: 16 });
  });

  it("clamps to the photo", () => {
    expect(moveCorner(box, 2, { x: 900, y: 900 }, none, 16, 640, 360)).toMatchObject({ x: 100, y: 100, width: 540, height: 260 });
    expect(moveCorner(box, 0, { x: -50, y: -50 }, none, 16, 640, 360)).toMatchObject({ x: 0, y: 0, width: 300, height: 200 });
  });

  it("does not change the mark it was given", () => {
    const start = mark(100, 100, 200, 100);
    moveCorner(start, 2, { x: 500, y: 300 }, none, 16);
    expect(start).toEqual(mark(100, 100, 200, 100));
  });
});

describe("addBoxPlacement", () => {
  it("centres a box of 30% of the visible photo on it", () => {
    const box = addBoxPlacement({ x: 0, y: 0, width: 1280, height: 960 }, { width: 1280, height: 960 }, 10);
    expect(box).toEqual({ x: 448, y: 336, width: 384, height: 288, type: "RECT" });
  });

  it("uses the visible part when zoomed in", () => {
    const box = addBoxPlacement({ x: 400, y: 300, width: 200, height: 100 }, { width: 1280, height: 960 }, 10);
    expect(box).toEqual({ x: 470, y: 335, width: 60, height: 30, type: "RECT" });
  });

  it("is at least the minimum a side", () => {
    const minSide = ADD_BOX_MIN_SIDE_PX * 3;
    const box = addBoxPlacement({ x: 400, y: 300, width: 200, height: 100 }, { width: 1280, height: 960 }, minSide);
    expect(box.width).toBe(144);
    expect(box.height).toBe(144);
  });

  it("stays inside the photo", () => {
    const box = addBoxPlacement({ x: 600, y: 330, width: 60, height: 40 }, { width: 640, height: 360 }, 48);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
    expect(box.y + box.height).toBeLessThanOrEqual(360);
    expect(box).toMatchObject({ x: 592, y: 312, width: 48, height: 48 });
  });
});
