import { describe, it, expect } from "vitest";
import { fitImage, applyView, zoomAt, panLimits, clampView, ensureVisible, IDENTITY_VIEW } from "./viewTransform";

/** How the photo sits on the stage, and touch zoom and pan (9 Oct 2026). */
describe("fitImage", () => {
  it("gives the numbers the image load handler always gave, for a wide photo", () => {
    // 1280 by 960 in the 960 by 600 desktop stage: binds on height
    expect(fitImage(1280, 960, 960, 600)).toEqual({ originX: 80, originY: 0, scale: 0.625 });
    // 640 by 360 is wider than the stage: binds on width
    expect(fitImage(640, 360, 960, 600)).toEqual({ originX: 0, originY: 30, scale: 1.5 });
  });

  it("gives them for a tall photo too", () => {
    expect(fitImage(600, 1200, 960, 600)).toEqual({ originX: 330, originY: 0, scale: 0.5 });
    // A phone's photo area, taller than wide
    expect(fitImage(1280, 960, 390, 520)).toEqual({ originX: 0, originY: 113.75, scale: 390 / 1280 });
  });

  it("is null without sizes", () => {
    expect(fitImage(NaN, 960, 960, 600)).toBeNull();
  });
});

describe("applyView", () => {
  it("is the fit itself at the identity view", () => {
    const fit = fitImage(1280, 960, 960, 600)!;
    expect(applyView(fit, IDENTITY_VIEW)).toEqual(fit);
  });
});

describe("zoomAt", () => {
  const fit = { originX: 0, originY: 100, scale: 0.5 };

  it("keeps the point it zooms about where it is", () => {
    const p = { x: 200, y: 260 };
    const before = applyView(fit, IDENTITY_VIEW);
    const imagePoint = { x: (p.x - before.originX) / before.scale, y: (p.y - before.originY) / before.scale };
    const after = applyView(fit, zoomAt(fit, IDENTITY_VIEW, p, p, 3));
    expect(imagePoint.x * after.scale + after.originX).toBeCloseTo(p.x);
    expect(imagePoint.y * after.scale + after.originY).toBeCloseTo(p.y);
    expect(after.scale).toBe(1.5);
  });

  it("clamps the zoom to 1 to 5", () => {
    expect(zoomAt(fit, IDENTITY_VIEW, { x: 0, y: 0 }, { x: 0, y: 0 }, 9).zoom).toBe(5);
    expect(zoomAt(fit, IDENTITY_VIEW, { x: 0, y: 0 }, { x: 0, y: 0 }, 0.2).zoom).toBe(1);
  });

  it("moves the point with the fingers' midpoint, which pans", () => {
    const view = zoomAt(fit, IDENTITY_VIEW, { x: 100, y: 150 }, { x: 130, y: 170 }, 1);
    expect(view).toEqual({ zoom: 1, panX: 30, panY: 20 });
  });
});

describe("panLimits", () => {
  // 1280 by 960 in a 390 by 520 area: 390 by 292.5 at fit, centred vertically
  const fit = fitImage(1280, 960, 390, 520)!;
  const area = { width: 390, height: 520 };
  const image = { width: 1280, height: 960 };

  it("keeps a photo larger than the area from showing a gap", () => {
    const limits = panLimits(fit, 2, area, image);
    // 780 px wide: the left edge from 390 - 780 to 0
    expect(limits.minX).toBeCloseTo(-390);
    expect(limits.maxX).toBeCloseTo(0);
    // 585 tall in 520: origin from -65 to 0, as pan from the fit's 113.75
    expect(limits.minY).toBeCloseTo(-65 - 113.75);
    expect(limits.maxY).toBeCloseTo(-113.75);
    const view = clampView({ zoom: 2, panX: 50, panY: -500 }, limits);
    expect(view.panX).toBeCloseTo(0);
    expect(view.panY).toBeCloseTo(-178.75);
  });

  it("keeps a photo smaller than the area centred", () => {
    const limits = panLimits(fit, 1, area, image);
    expect(limits).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  });

  it("lets the photo move up by as much as the sheet covers", () => {
    const limits = panLimits(fit, 1, area, image, 120);
    expect(limits.minY).toBe(-120);
    expect(limits.maxY).toBe(0);
  });
});

describe("ensureVisible", () => {
  const visible = { x: 0, y: 0, width: 390, height: 300 };
  const limits = { minX: -500, maxX: 500, minY: -120, maxY: 0 };

  it("leaves a box already in view alone", () => {
    expect(ensureVisible({ x: 50, y: 50, width: 60, height: 60 }, visible, { panX: 0, panY: 0 }, limits)).toEqual({ panX: 0, panY: 0 });
  });

  it("makes the smallest shift that brings the box into view with its margin", () => {
    // Bottom at 330, visible to 300 - 12
    expect(ensureVisible({ x: 50, y: 270, width: 60, height: 60 }, visible, { panX: 0, panY: 0 }, limits)).toEqual({ panX: 0, panY: -42 });
    expect(ensureVisible({ x: 360, y: 50, width: 60, height: 60 }, visible, { panX: 0, panY: 0 }, limits)).toEqual({ panX: -42, panY: 0 });
  });

  it("never shifts more than the sheet covers", () => {
    expect(ensureVisible({ x: 50, y: 480, width: 60, height: 30 }, visible, { panX: 0, panY: 0 }, limits)).toEqual({ panX: 0, panY: -120 });
  });
});
