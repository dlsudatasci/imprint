import { describe, it, expect } from "vitest";
import { loupePlacement, loupeSource, LOUPE_SIZE_PX } from "./loupe";

/** The magnifier while a corner is dragged on touch (9 Oct 2026). */
const area = { width: 390, height: 500 };

describe("loupePlacement", () => {
  it("centres the loupe 96 px above the finger", () => {
    expect(loupePlacement({ x: 200, y: 300 }, area)).toEqual({ left: 144, top: 148, below: false });
  });

  it("goes 96 px below the finger near the top of the photo", () => {
    expect(loupePlacement({ x: 200, y: 100 }, area)).toEqual({ left: 144, top: 140, below: true });
  });

  it("stays 8 px inside the area's left and right sides", () => {
    expect(loupePlacement({ x: 10, y: 300 }, area).left).toBe(8);
    expect(loupePlacement({ x: 385, y: 300 }, area).left).toBe(390 - LOUPE_SIZE_PX - 8);
  });
});

describe("loupeSource", () => {
  it("is a square of 112 CSS px at 2.5 times the display scale, centred on the corner", () => {
    // A 1280 px photo shown 390 px wide
    const src = loupeSource({ x: 640, y: 480 }, 390 / 1280);
    expect(src.sw).toBeCloseTo(112 / ((390 / 1280) * 2.5));
    expect(src.sx).toBeCloseTo(640 - src.sw / 2);
    expect(src.draw).toMatchObject({ dx: 0, dy: 0 });
    expect(src.draw!.dw).toBeCloseTo(112);
  });

  it("magnifies more of the photo less after a pinch zoom", () => {
    expect(loupeSource({ x: 100, y: 100 }, 1).sw).toBeCloseTo(44.8);
    expect(loupeSource({ x: 100, y: 100 }, 2).sw).toBeCloseTo(22.4);
  });

  it("draws only the part on the photo at the photo's corner, leaving the rest dark", () => {
    const src = loupeSource({ x: 0, y: 0 }, 1, 2.5, 112, { width: 640, height: 360 });
    // The square is 44.8 image px: the top-left quarter is off the photo
    expect(src.draw).toMatchObject({ sx: 0, sy: 0 });
    expect(src.draw!.sw).toBeCloseTo(22.4);
    expect(src.draw!.dx).toBeCloseTo(56);
    expect(src.draw!.dy).toBeCloseTo(56);
    expect(src.draw!.dw).toBeCloseTo(56);
  });

  it("clips at the photo's right and bottom edges too", () => {
    const src = loupeSource({ x: 640, y: 360 }, 1, 2.5, 112, { width: 640, height: 360 });
    expect(src.draw!.sx).toBeCloseTo(617.6);
    expect(src.draw!.dx).toBeCloseTo(0);
    expect(src.draw!.dw).toBeCloseTo(56);
    expect(src.draw!.dh).toBeCloseTo(56);
  });

  it("draws nothing when the square is wholly off the photo", () => {
    expect(loupeSource({ x: -100, y: -100 }, 1, 2.5, 112, { width: 640, height: 360 }).draw).toBeNull();
  });
});
