import { describe, it, expect } from "vitest";
import { fitImage, applyView, zoomAt, panLimits, clampView, ensureVisible, keepPhotoInPlace, photoAreaSettled, IDENTITY_VIEW, zoomStep, panBy, wheelPixels, ZOOM_STEP, MAX_ZOOM } from "./viewTransform";

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

describe("keepPhotoInPlace (22 Oct 2026)", () => {
  // A 640 by 360 photo on a 348 px wide phone: the area 350 px tall at rest, 470 px with a box open
  const image = { width: 640, height: 360 };
  const rest = fitImage(640, 360, 348, 350)!;
  const open = fitImage(640, 360, 348, 470)!;

  it("keeps the photo where it was when the area grows under it", () => {
    expect(open.originY - rest.originY).toBeCloseTo(60);
    const view = keepPhotoInPlace({ x: rest.originX, y: rest.originY }, open, 1, panLimits(open, 1, { width: 348, height: 470 }, image, 217));
    expect(view.zoom).toBe(1);
    expect(view.panX).toBe(0);
    expect(view.panY).toBeCloseTo(-60);
    expect(applyView(open, view).originY).toBeCloseTo(rest.originY);
  });

  it("goes only as far as the limits allow", () => {
    // No sheet over the photo: a photo smaller than the area stays centred
    expect(keepPhotoInPlace({ x: 0, y: rest.originY }, open, 1, panLimits(open, 1, { width: 348, height: 470 }, image, 0)).panY).toBe(0);
    expect(keepPhotoInPlace({ x: 0, y: -500 }, open, 1, panLimits(open, 1, { width: 348, height: 470 }, image, 217)).panY).toBe(-217);
  });
});

describe("photoAreaSettled (22 Oct 2026)", () => {
  it("is settled once the area's bottom, its height on the page and the measured stage all agree", () => {
    expect(photoAreaSettled({ measured: 470, stage: 470, edge: 163, restingEdge: 163 })).toBe(true);
    expect(photoAreaSettled({ measured: 470.6, stage: 470, edge: 163, restingEdge: 163 })).toBe(true);
  });

  it("is not while the area's bottom has yet to follow the sheet, or the stage has yet to be measured again", () => {
    expect(photoAreaSettled({ measured: 350, stage: 350, edge: 283, restingEdge: 163 })).toBe(false);
    expect(photoAreaSettled({ measured: 470, stage: 350, edge: 163, restingEdge: 163 })).toBe(false);
  });

  it("counts as settled with nothing laid out (no measurement to wait for)", () => {
    expect(photoAreaSettled({ measured: null, stage: null, edge: 0, restingEdge: 0 })).toBe(true);
    expect(photoAreaSettled({ measured: 0, stage: 470, edge: 0, restingEdge: 0 })).toBe(true);
  });
});

/**
 * S28 (13 Nov 2026): zoom on a laptop. One click of Zoom in or Zoom out, the
 * wheel moving a zoomed photo, and the wheel's units. The desktop stage is
 * 960 by 600 and a 640 by 360 photo fills its width (fit scale 1.5, 30 px down).
 */
describe("zoomStep, panBy and wheelPixels (S28)", () => {
  const stage = { width: 960, height: 600 };
  const image = { width: 640, height: 360 };
  const fit = fitImage(640, 360, 960, 600)!;
  const centre = { x: 480, y: 300 };
  /** The image point under a stage point */
  const under = (view: { zoom: number; panX: number; panY: number }, p: { x: number; y: number }) => {
    const s = applyView(fit, view);
    return { x: (p.x - s.originX) / s.scale, y: (p.y - s.originY) / s.scale };
  };

  it("multiplies the zoom by 1.5 to zoom in and divides it to zoom out", () => {
    expect(ZOOM_STEP).toBe(1.5);
    const once = zoomStep(fit, IDENTITY_VIEW, 1, centre, stage, image);
    expect(once.zoom).toBeCloseTo(1.5);
    expect(zoomStep(fit, once, 1, centre, stage, image).zoom).toBeCloseTo(2.25);
    expect(zoomStep(fit, { zoom: 2.25, panX: 0, panY: 0 }, -1, centre, stage, image).zoom).toBeCloseTo(1.5);
  });

  it("keeps the centre where it is: the middle of the stage, or an open box's centre", () => {
    const once = zoomStep(fit, IDENTITY_VIEW, 1, centre, stage, image);
    const a = under(IDENTITY_VIEW, centre), b = under(once, centre);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
    // A box's centre left of the middle stays put too, where the limits allow
    const box = { x: 300, y: 250 };
    const atBox = zoomStep(fit, IDENTITY_VIEW, 1, box, stage, image);
    expect(under(atBox, box).x).toBeCloseTo(under(IDENTITY_VIEW, box).x, 6);
    expect(under(atBox, box).y).toBeCloseTo(under(IDENTITY_VIEW, box).y, 6);
  });

  it("stays within 1 and MAX_ZOOM, and reaching 1 is the identity view, Fit", () => {
    expect(zoomStep(fit, { zoom: 4, panX: -100, panY: -100 }, 1, centre, stage, image).zoom).toBe(MAX_ZOOM);
    expect(zoomStep(fit, { zoom: MAX_ZOOM, panX: -100, panY: -100 }, 1, centre, stage, image).zoom).toBe(MAX_ZOOM);
    expect(zoomStep(fit, { zoom: 1.4, panX: -40, panY: -10 }, -1, centre, stage, image)).toEqual(IDENTITY_VIEW);
    expect(zoomStep(fit, { zoom: 1.5, panX: -240, panY: -150 }, -1, centre, stage, image)).toEqual(IDENTITY_VIEW);
    expect(zoomStep(fit, IDENTITY_VIEW, -1, centre, stage, image)).toEqual(IDENTITY_VIEW);
  });

  it("keeps the photo over the stage at the corners: the pan limits apply", () => {
    const corner = zoomStep(fit, IDENTITY_VIEW, 1, { x: 0, y: 0 }, stage, image);
    const limits = panLimits(fit, corner.zoom, stage, image);
    expect(corner.panX).toBeGreaterThanOrEqual(limits.minX);
    expect(corner.panX).toBeLessThanOrEqual(limits.maxX);
    expect(corner.panY).toBeGreaterThanOrEqual(limits.minY);
    expect(corner.panY).toBeLessThanOrEqual(limits.maxY);
  });

  it("moves a zoomed photo by the scroll and says so, and not past its edge", () => {
    const view = { zoom: 2, panX: -480, panY: -300 };
    const moved = panBy(fit, view, 40, -25, stage, image);
    expect(moved.moved).toBe(true);
    expect(moved.view).toEqual({ zoom: 2, panX: -440, panY: -325 });
    // At the left edge already (panX at its most), a move further that way does nothing
    const limits = panLimits(fit, 2, stage, image);
    const atEdge = { zoom: 2, panX: limits.maxX, panY: -300 };
    expect(panBy(fit, atEdge, 50, 0, stage, image)).toEqual({ view: atEdge, moved: false });
    // Part of a move past the edge still moves up to it
    const near = { zoom: 2, panX: limits.maxX - 10, panY: -300 };
    expect(panBy(fit, near, 50, 0, stage, image)).toEqual({ view: { ...near, panX: limits.maxX }, moved: true });
  });

  it("does not move the photo at Fit", () => {
    expect(panBy(fit, IDENTITY_VIEW, 0, -100, stage, image).moved).toBe(false);
  });

  it("reads lines as 16 px and pages as the page given", () => {
    expect(wheelPixels(-3, 0)).toBe(-3);
    expect(wheelPixels(3, 1)).toBe(48);
    expect(wheelPixels(1, 2, 500)).toBe(500);
  });
});
