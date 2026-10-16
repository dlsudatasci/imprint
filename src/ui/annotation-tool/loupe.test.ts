import { describe, it, expect } from "vitest";
import {
  loupePlacement,
  loupeSource,
  LOUPE_SIZE_PX,
  LOUPE_MARGIN_PX,
  LOUPE_BOX_GAP_PX,
  LOUPE_FINGER_CLEAR_PX,
  LOUPE_POINTER_CLEAR_PX,
  LOUPE_OFFSET_PX,
  type LoupeAvoid,
  type LoupePlace,
} from "./loupe";

/** The magnifier while a corner is dragged on touch (9 Oct 2026). */
const area = { width: 390, height: 500 };

describe("loupePlacement", () => {
  it("centres the loupe 96 px above the finger", () => {
    expect(loupePlacement({ x: 200, y: 300 }, area)).toEqual({ left: 144, top: 148, side: "above", clear: true });
  });

  it("goes 96 px below the finger near the top of the photo", () => {
    expect(loupePlacement({ x: 200, y: 100 }, area)).toEqual({ left: 144, top: 140, side: "below", clear: true });
  });

  it("stays 8 px inside the area's left and right sides", () => {
    expect(loupePlacement({ x: 10, y: 300 }, area).left).toBe(8);
    expect(loupePlacement({ x: 385, y: 300 }, area).left).toBe(390 - LOUPE_SIZE_PX - 8);
  });

  it("places it as before when there is no box, or the box is not a usable rectangle (the Sidewalk step)", () => {
    const before = loupePlacement({ x: 200, y: 300 }, area);
    expect(loupePlacement({ x: 200, y: 300 }, area, LOUPE_SIZE_PX, { box: null })).toEqual(before);
    expect(loupePlacement({ x: 200, y: 300 }, area, LOUPE_SIZE_PX, { box: { left: NaN, top: 0, width: 10, height: 10 } })).toEqual(before);
  });
});

// 15 Oct 2026: outside the box being fitted, for both roles on every device
const half = LOUPE_SIZE_PX / 2;
const square = (p: LoupePlace) => ({ x1: p.left, y1: p.top, x2: p.left + LOUPE_SIZE_PX, y2: p.top + LOUPE_SIZE_PX });
const boxEdges = (b: { left: number; top: number; width: number; height: number }) => ({
  x1: b.left - LOUPE_BOX_GAP_PX,
  y1: b.top - LOUPE_BOX_GAP_PX,
  x2: b.left + b.width + LOUPE_BOX_GAP_PX,
  y2: b.top + b.height + LOUPE_BOX_GAP_PX,
});
type E = { x1: number; y1: number; x2: number; y2: number };
// Touching is not overlapping; 1e-9 absorbs rounding where the loupe sits exactly on the gap's edge
const EPS = 1e-9;
const overlaps = (a: E, b: E) => a.x1 < b.x2 - EPS && b.x1 < a.x2 - EPS && a.y1 < b.y2 - EPS && b.y1 < a.y2 - EPS;
const insideArea = (p: LoupePlace, a: { width: number; height: number }) =>
  p.left >= LOUPE_MARGIN_PX - 1e-9 && p.top >= LOUPE_MARGIN_PX - 1e-9 &&
  p.left + LOUPE_SIZE_PX <= a.width - LOUPE_MARGIN_PX + 1e-9 && p.top + LOUPE_SIZE_PX <= a.height - LOUPE_MARGIN_PX + 1e-9;
/** The loupe is on the finger when its centre is strictly within the clearance plus half the loupe */
const onFinger = (p: LoupePlace, finger: { x: number; y: number }, clear: number) => {
  const cx = p.left + half;
  const cy = p.top + half;
  const r = clear + half;
  return Math.abs(cx - finger.x) < r - EPS && Math.abs(cy - finger.y) < r - EPS;
};

describe("loupePlacement outside the box being fitted", () => {
  const phone = { width: 390, height: 560 };

  it("stays where it was, 96 px above the finger, when that is already clear of the box (a top corner)", () => {
    // The top-left corner of a box below and to the right of it
    const box = { left: 150, top: 300, width: 160, height: 120 };
    const finger = { x: 150, y: 300 };
    const placed = loupePlacement(finger, phone, LOUPE_SIZE_PX, { box, point: finger });
    expect(placed).toEqual({ ...loupePlacement(finger, phone), clear: true });
    expect(placed.side).toBe("above");
    expect(overlaps(square(placed), boxEdges(box))).toBe(false);
  });

  it("moves beside the box when above the finger would cover it (a bottom corner of a tall box)", () => {
    const box = { left: 40, top: 150, width: 160, height: 250 };
    const finger = { x: 200, y: 400 };
    // As before it would have sat on the box
    expect(overlaps(square({ ...loupePlacement(finger, phone), side: "above", clear: true }), boxEdges(box))).toBe(true);
    const placed = loupePlacement(finger, phone, LOUPE_SIZE_PX, { box, point: finger });
    expect(placed).toMatchObject({ side: "right", clear: true });
    expect(placed.left).toBe(200 + LOUPE_BOX_GAP_PX);
    expect(placed.top + half).toBe(400 - LOUPE_OFFSET_PX);
    expect(overlaps(square(placed), boxEdges(box))).toBe(false);
  });

  it("goes to the left of a box at the right of the photo", () => {
    const box = { left: 220, top: 150, width: 150, height: 250 };
    const finger = { x: 370, y: 400 };
    const placed = loupePlacement(finger, phone, LOUPE_SIZE_PX, { box, point: finger });
    expect(placed).toMatchObject({ side: "left", clear: true });
    expect(placed.left + LOUPE_SIZE_PX).toBe(220 - LOUPE_BOX_GAP_PX);
  });

  it("goes above a box across the whole width, and below it only when nothing above or beside is clear, on touch", () => {
    const wide = { left: 0, top: 200, width: 390, height: 150 };
    const above = loupePlacement({ x: 390, y: 350 }, phone, LOUPE_SIZE_PX, { box: wide, point: { x: 390, y: 350 } });
    expect(above).toMatchObject({ side: "above", clear: true });
    expect(above.top + LOUPE_SIZE_PX).toBe(200 - LOUPE_BOX_GAP_PX);
    // The box reaches the top of the photo: only below is left
    const tall = { left: 0, top: 0, width: 390, height: 300 };
    const below = loupePlacement({ x: 390, y: 300 }, phone, LOUPE_SIZE_PX, { box: tall, point: { x: 390, y: 300 } });
    expect(below).toMatchObject({ side: "below", clear: true });
    expect(below.top).toBeGreaterThanOrEqual(300 + LOUPE_BOX_GAP_PX);
  });

  it("with a mouse takes the nearest side, below included, since no hand is in the way", () => {
    const area = { width: 960, height: 600 };
    // The bottom-right corner of a tall box: below it is 96 px from the
    // corner, beside it about 117 px. Touch keeps to the side, off the hand.
    const box = { left: 100, top: 40, width: 200, height: 300 };
    const pointer = { x: 300, y: 340 };
    const touch = loupePlacement(pointer, area, LOUPE_SIZE_PX, { box, point: pointer, input: "touch" });
    const mouse = loupePlacement(pointer, area, LOUPE_SIZE_PX, { box, point: pointer, input: "mouse" });
    expect(touch).toMatchObject({ side: "right", clear: true });
    expect(mouse).toMatchObject({ side: "below", clear: true });
    expect(mouse.top + half).toBe(340 + LOUPE_OFFSET_PX);
    // With no room beside it either, touch goes above, the mouse below
    const wide = { left: 0, top: 150, width: 960, height: 200 };
    const at = { x: 500, y: 350 };
    expect(loupePlacement(at, area, LOUPE_SIZE_PX, { box: wide, point: at, input: "touch" }).side).toBe("above");
    expect(loupePlacement(at, area, LOUPE_SIZE_PX, { box: wide, point: at, input: "mouse" }).side).toBe("below");
  });

  it("keeps the side it used last while that stays clear, so it does not jump as the box grows", () => {
    const box = { left: 100, top: 300, width: 120, height: 100 };
    const finger = { x: 220, y: 300 };
    expect(loupePlacement(finger, phone, LOUPE_SIZE_PX, { box, point: finger }).side).toBe("above");
    const kept = loupePlacement(finger, phone, LOUPE_SIZE_PX, { box, point: finger, prefer: "right" });
    expect(kept).toMatchObject({ side: "right", clear: true });
    expect(overlaps(square(kept), boxEdges(box))).toBe(false);
    // Not kept once it is no longer clear: no room to the right of a box at the photo's right
    const atRight = { left: 200, top: 300, width: 190, height: 100 };
    expect(loupePlacement({ x: 390, y: 300 }, phone, LOUPE_SIZE_PX, { box: atRight, point: { x: 390, y: 300 }, prefer: "right" }).side).not.toBe("right");
  });

  it("never sits on the finger, even where the finger is outside the box", () => {
    // The finger holds the corner from 20 px outside it, near the photo's top
    const box = { left: 150, top: 120, width: 120, height: 200 };
    const finger = { x: 130, y: 100 };
    const placed = loupePlacement(finger, phone, LOUPE_SIZE_PX, { box, point: { x: 150, y: 120 } });
    expect(placed.clear).toBe(true);
    expect(onFinger(placed, finger, LOUPE_FINGER_CLEAR_PX)).toBe(false);
    expect(overlaps(square(placed), boxEdges(box))).toBe(false);
  });

  it("keeps clear of the floating panel when there is room elsewhere, and covers it rather than the box when there is not", () => {
    const area = { width: 960, height: 600 };
    // The car's bottom-right corner dragged to (330, 240), its panel to the right
    const box = { left: 100, top: 100, width: 230, height: 140 };
    const panel = { left: 340, top: 100, width: 290, height: 220 };
    const pointer = { x: 330, y: 240 };
    const placed = loupePlacement(pointer, area, LOUPE_SIZE_PX, { box, point: pointer, panel, input: "mouse" });
    expect(placed.clear).toBe(true);
    expect(overlaps(square(placed), boxEdges(box))).toBe(false);
    expect(overlaps(square(placed), { x1: 340, y1: 100, x2: 630, y2: 320 })).toBe(false);
    // A panel over every clear spot: the box still wins
    const everywhere = { left: 0, top: 0, width: 960, height: 600 };
    const covered = loupePlacement(pointer, area, LOUPE_SIZE_PX, { box, point: pointer, panel: everywhere, input: "mouse" });
    expect(covered.clear).toBe(true);
    expect(overlaps(square(covered), boxEdges(box))).toBe(false);
  });

  it("covers as little of the box as it can, inside the photo and off the finger, when nothing is clear", () => {
    // Zoomed right in: the box fills the photo area
    const box = { left: -50, top: -50, width: 500, height: 700 };
    const finger = { x: 300, y: 400 };
    const placed = loupePlacement(finger, phone, LOUPE_SIZE_PX, { box, point: finger });
    expect(placed.clear).toBe(false);
    expect(insideArea(placed, phone)).toBe(true);
    expect(onFinger(placed, finger, LOUPE_FINGER_CLEAR_PX)).toBe(false);
  });

  it("stays at the area's left margin in an area narrower than the loupe, as before", () => {
    const narrow = { width: 100, height: 400 };
    const placed = loupePlacement({ x: 50, y: 300 }, narrow, LOUPE_SIZE_PX, { box: { left: 20, top: 250, width: 40, height: 40 } });
    expect(placed.left).toBe(LOUPE_MARGIN_PX);
    expect(placed.clear).toBe(false);
  });
});

/** A small seeded generator, so the sweep below is the same on every run */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("loupePlacement across phones, tablets and desktops", () => {
  // Photo areas as the tool gives them, CSS px: phones upright and sideways,
  // with the sheet down or up, tablets, a shrunk desktop stage and a full one
  const areas = [
    { width: 320, height: 380 }, { width: 360, height: 470 }, { width: 390, height: 560 }, { width: 430, height: 640 },
    { width: 844, height: 300 }, { width: 932, height: 330 }, { width: 390, height: 300 },
    { width: 768, height: 700 }, { width: 820, height: 760 }, { width: 1024, height: 560 },
    { width: 691, height: 432 }, { width: 960, height: 600 },
  ];
  const next = random(20261015);
  const between = (lo: number, hi: number) => lo + next() * (hi - lo);
  const cases: Array<{ area: { width: number; height: number }; finger: { x: number; y: number }; avoid: LoupeAvoid; clear: number }> = [];
  for (const area of areas) {
    for (let i = 0; i < 40; i++) {
      // Boxes from small to most of the photo, some running past its edges (zoomed in)
      const width = between(20, area.width * 1.1);
      const height = between(20, area.height * 1.1);
      const box = { left: between(-0.1 * area.width, area.width - width * 0.5), top: between(-0.1 * area.height, area.height - height * 0.5), width, height };
      // A corner, or with the mouse an edge's middle
      const input = next() < 0.5 ? "touch" : "mouse";
      const xs = [box.left, box.left + width / 2, box.left + width];
      const ys = [box.top, box.top + height / 2, box.top + height];
      const point = input === "touch"
        ? { x: next() < 0.5 ? box.left : box.left + width, y: next() < 0.5 ? box.top : box.top + height }
        : { x: xs[Math.floor(next() * 3)], y: ys[Math.floor(next() * 3)] };
      const finger = { x: point.x + between(-20, 20), y: point.y + between(-20, 20) };
      const panel = input === "mouse" && next() < 0.5 ? { left: box.left + width + 10, top: box.top, width: 290, height: 220 } : null;
      cases.push({ area, finger, avoid: { box, point, panel, input }, clear: input === "mouse" ? LOUPE_POINTER_CLEAR_PX : LOUPE_FINGER_CLEAR_PX });
    }
  }

  /** Every 4 px: is there a centre that keeps the loupe inside the area, off the box and off the finger? */
  function someClearSpot(area: { width: number; height: number }, finger: { x: number; y: number }, box: E, clear: number, extra?: E | null) {
    for (let cx = LOUPE_MARGIN_PX + half; cx <= area.width - LOUPE_MARGIN_PX - half; cx += 4) {
      for (let cy = LOUPE_MARGIN_PX + half; cy <= area.height - LOUPE_MARGIN_PX - half; cy += 4) {
        const sq = { x1: cx - half, y1: cy - half, x2: cx + half, y2: cy + half };
        if (overlaps(sq, box)) continue;
        if (Math.abs(cx - finger.x) < clear + half && Math.abs(cy - finger.y) < clear + half) continue;
        if (extra && overlaps(sq, extra)) continue;
        return true;
      }
    }
    return false;
  }

  it(`is always inside the photo area, never on the finger when it says clear, and clear whenever any spot is (${cases.length} cases)`, () => {
    for (const { area, finger, avoid, clear } of cases) {
      const placed = loupePlacement(finger, area, LOUPE_SIZE_PX, avoid);
      const box = boxEdges(avoid.box!);
      expect(insideArea(placed, area)).toBe(true);
      if (placed.clear) {
        expect(overlaps(square(placed), box)).toBe(false);
        expect(onFinger(placed, finger, clear)).toBe(false);
      } else {
        // It only gives up when the brute force finds no spot either
        expect(someClearSpot(area, finger, box, clear)).toBe(false);
      }
    }
  });

  it("keeps clear of the panel whenever a spot clear of the box, the finger and the panel exists (mouse)", () => {
    for (const { area, finger, avoid, clear } of cases) {
      if (!avoid.panel) continue;
      const placed = loupePlacement(finger, area, LOUPE_SIZE_PX, avoid);
      const panel = { x1: avoid.panel.left, y1: avoid.panel.top, x2: avoid.panel.left + avoid.panel.width, y2: avoid.panel.top + avoid.panel.height };
      if (someClearSpot(area, finger, boxEdges(avoid.box!), clear, panel)) {
        expect(overlaps(square(placed), panel)).toBe(false);
      }
    }
  });

  it("on touch goes below the box only when no spot above or beside it is clear", () => {
    for (const { area, finger, avoid, clear } of cases) {
      if (avoid.input !== "touch") continue;
      const placed = loupePlacement(finger, area, LOUPE_SIZE_PX, avoid);
      if (placed.side !== "below" || !placed.clear) continue;
      const box = boxEdges(avoid.box!);
      // Any clear spot not wholly below the box (its top above the box's bottom) would be above or beside it
      let found = false;
      for (let cx = LOUPE_MARGIN_PX + half; cx <= area.width - LOUPE_MARGIN_PX - half && !found; cx += 4) {
        for (let cy = LOUPE_MARGIN_PX + half; cy <= area.height - LOUPE_MARGIN_PX - half; cy += 4) {
          const sq = { x1: cx - half, y1: cy - half, x2: cx + half, y2: cy + half };
          if (sq.y1 >= box.y2 - EPS || overlaps(sq, box)) continue;
          if (Math.abs(cx - finger.x) < clear + half && Math.abs(cy - finger.y) < clear + half) continue;
          found = true;
          break;
        }
      }
      expect(found).toBe(false);
    }
  });

  it("covers every outcome: each side, and the case with nowhere clear", () => {
    const seen = new Set<string>();
    for (const { area, finger, avoid } of cases) {
      const placed = loupePlacement(finger, area, LOUPE_SIZE_PX, avoid);
      seen.add(placed.clear ? `${avoid.input}:${placed.side}` : "nowhere clear");
    }
    for (const outcome of ["touch:above", "touch:left", "touch:right", "touch:below", "mouse:above", "mouse:left", "mouse:right", "mouse:below", "nowhere clear"]) {
      expect(seen).toContain(outcome);
    }
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
