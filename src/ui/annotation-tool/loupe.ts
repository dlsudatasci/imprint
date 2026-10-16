/**
 * The magnifier shown while a box's corner is dragged on touch (contributors,
 * 9 Oct 2026, IMPRINT_contributor_mobile.md section 3.2), like the iPhone's
 * document scanner: the finger covers the corner, so the loupe shows the photo
 * under it. From 10 Oct 2026 also while a resize handle is dragged with the
 * mouse, and from 12 Oct 2026 while a Sidewalk point is aimed, for both roles.
 * From 15 Oct 2026 it sits outside the box being fitted (loupePlacement).
 * Pure placement and source maths. The tool paints it.
 */

/** Across, CSS px */
export const LOUPE_SIZE_PX = 112;
/** The photo in the loupe, times its current display scale (so it still magnifies after a pinch zoom) */
export const LOUPE_MAGNIFICATION = 2.5;
/** From the finger to the loupe's centre, CSS px */
export const LOUPE_OFFSET_PX = 96;
/** Kept this far inside the photo area's sides, CSS px */
export const LOUPE_MARGIN_PX = 8;
/** What the loupe shows past the photo's edge */
export const LOUPE_BACKGROUND = "#0b0f14";

/**
 * Kept this far outside the box being fitted, CSS px (15 Oct 2026): clears a
 * corner's touch handle (a 10 px radius dot with a 2.5 px ring) and the
 * mouse's 10 px square handles.
 */
export const LOUPE_BOX_GAP_PX = 12;
/** Kept clear around the finger on touch, and around the pointer with a mouse, CSS px */
export const LOUPE_FINGER_CLEAR_PX = 24;
export const LOUPE_POINTER_CLEAR_PX = 16;

type Point = { x: number; y: number };
type Rect = { left: number; top: number; width: number; height: number };
/** A rectangle by its edges, CSS px */
type Edges = { x1: number; y1: number; x2: number; y2: number };

/** Where the loupe sits against the box being fitted */
export type LoupeSide = "above" | "below" | "left" | "right";

export interface LoupeAvoid {
  /** The box being fitted, CSS px in the photo area. Without it the loupe goes above or below the finger. */
  box?: Rect | null;
  /** The corner or handle being dragged, CSS px. The loupe goes as near it as it can. Defaults to the finger. */
  point?: Point | null;
  /** The box's floating panel (desktop layout), kept clear when there is room elsewhere */
  panel?: Rect | null;
  /** "touch": the hand is below the finger, so below the box comes last. "mouse": every side is equal. */
  input?: "touch" | "mouse";
  /** The side used last, kept while it is still clear, so the loupe does not jump as the box changes size */
  prefer?: LoupeSide | null;
}

export interface LoupePlace {
  /** The loupe's top-left corner, CSS px in the photo area */
  left: number;
  top: number;
  side: LoupeSide;
  /** False when no spot in the photo area keeps clear of the box and the finger, and the loupe covers as little as it can */
  clear: boolean;
}

const edgesOf = (r: Rect): Edges => ({
  x1: Math.min(r.left, r.left + r.width),
  y1: Math.min(r.top, r.top + r.height),
  x2: Math.max(r.left, r.left + r.width),
  y2: Math.max(r.top, r.top + r.height),
});
const grow = (e: Edges, by: number): Edges => ({ x1: e.x1 - by, y1: e.y1 - by, x2: e.x2 + by, y2: e.y2 + by });
/** Strictly inside: a point on the edge is outside, so the loupe may touch what it avoids */
const strictlyInside = (p: Point, e: Edges) => p.x > e.x1 && p.x < e.x2 && p.y > e.y1 && p.y < e.y2;
const overlapArea = (a: Edges, b: Edges) =>
  Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
/** Into [lo, hi], or lo when the range is empty (an area narrower than the loupe), as the loupe always did */
const clampTo = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(Math.max(v, lo), hi));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The centre in `range` nearest `preferred` that is in none of `blocked`
 * (each strictly inside, so an edge is allowed), or null when there is none.
 * Exact: the nearest point of a region bounded by axis-aligned edges has each
 * coordinate at the preferred one or on one of those edges, so trying every
 * such pair finds it.
 */
function nearestFree(range: Edges, preferred: Point, blocked: Edges[]): Point | null {
  if (range.x1 > range.x2 || range.y1 > range.y2) return null;
  const xs = [clampTo(preferred.x, range.x1, range.x2), range.x1, range.x2];
  const ys = [clampTo(preferred.y, range.y1, range.y2), range.y1, range.y2];
  for (const b of blocked) {
    xs.push(b.x1, b.x2);
    ys.push(b.y1, b.y2);
  }
  let best: Point | null = null;
  let bestDistance = Infinity;
  for (const x of xs) {
    if (x < range.x1 || x > range.x2) continue;
    for (const y of ys) {
      if (y < range.y1 || y > range.y2) continue;
      const p = { x, y };
      if (blocked.some((b) => strictlyInside(p, b))) continue;
      const d = distance(p, preferred);
      if (d < bestDistance) {
        best = p;
        bestDistance = d;
      }
    }
  }
  return best;
}

/**
 * Where the loupe goes, its top-left corner in the photo area, CSS px.
 *
 * Without a box (the Sidewalk step) it is as it was from 9 Oct 2026: centred
 * 96 px above the finger, or 96 px below it when that would go above the
 * area's top, and kept 8 px inside the area's sides.
 *
 * With the box being fitted (15 Oct 2026, both roles, every device; an
 * annotator found it often covered the box on a phone) it goes outside the
 * box, LOUPE_BOX_GAP_PX clear of it and its handles, so the whole box stays in
 * view. It is placed in one of the four bands around the box, above, left,
 * right or below, at the spot nearest the corner or handle being dragged that
 * also keeps it 8 px inside the photo area and clear of the finger (or
 * pointer). On touch below comes last, since the hand is below the finger.
 * The floating panel is kept clear too when there is room elsewhere. The side
 * used last is kept while it is still clear. When no spot keeps clear of the
 * box and the finger (a box filling the photo, or zoomed right in) the loupe
 * goes where it covers the least of the box, never on the finger if it can
 * help it, and `clear` is false.
 */
export function loupePlacement(
  finger: Point,
  area: { width: number; height: number },
  size = LOUPE_SIZE_PX,
  avoid: LoupeAvoid = {},
): LoupePlace {
  const half = size / 2;
  const box0 = avoid.box;
  if (!box0 || ![box0.left, box0.top, box0.width, box0.height].every(Number.isFinite)) {
    const below = finger.y - LOUPE_OFFSET_PX - half < 0;
    const centreY = below ? finger.y + LOUPE_OFFSET_PX : finger.y - LOUPE_OFFSET_PX;
    const maxLeft = area.width - size - LOUPE_MARGIN_PX;
    const left = Math.max(LOUPE_MARGIN_PX, Math.min(finger.x - half, maxLeft));
    return { left, top: centreY - half, side: below ? "below" : "above", clear: true };
  }

  const input = avoid.input ?? "touch";
  const point = avoid.point ?? finger;
  const box = grow(edgesOf(box0), LOUPE_BOX_GAP_PX);
  // Where the centre may go: the loupe 8 px inside the area
  const inside: Edges = {
    x1: LOUPE_MARGIN_PX + half,
    y1: LOUPE_MARGIN_PX + half,
    x2: area.width - LOUPE_MARGIN_PX - half,
    y2: area.height - LOUPE_MARGIN_PX - half,
  };
  // Centres that would put the loupe on the finger, or on the panel
  const clearance = input === "mouse" ? LOUPE_POINTER_CLEAR_PX : LOUPE_FINGER_CLEAR_PX;
  const onFinger: Edges = grow({ x1: finger.x, y1: finger.y, x2: finger.x, y2: finger.y }, clearance + half);
  const onPanel = avoid.panel ? grow(edgesOf(avoid.panel), half) : null;

  // Each band's range of centres, and the centre it would rather have: level
  // with the finger and 96 px above it, as without a box, but past the box
  const bands: Record<LoupeSide, { range: Edges; preferred: Point }> = {
    above: { range: { ...inside, y2: Math.min(inside.y2, box.y1 - half) }, preferred: { x: finger.x, y: finger.y - LOUPE_OFFSET_PX } },
    below: { range: { ...inside, y1: Math.max(inside.y1, box.y2 + half) }, preferred: { x: finger.x, y: finger.y + LOUPE_OFFSET_PX } },
    left: { range: { ...inside, x2: Math.min(inside.x2, box.x1 - half) }, preferred: { x: box.x1 - half, y: finger.y - LOUPE_OFFSET_PX } },
    right: { range: { ...inside, x1: Math.max(inside.x1, box.x2 + half) }, preferred: { x: box.x2 + half, y: finger.y - LOUPE_OFFSET_PX } },
  };

  // The side of the box the point is on comes before the other
  const near: LoupeSide = point.x <= (box.x1 + box.x2) / 2 ? "left" : "right";
  const far: LoupeSide = near === "left" ? "right" : "left";
  const tiers: LoupeSide[][] = input === "mouse" ? [["above", near, far, "below"]] : [["above", near, far], ["below"]];
  const place = (side: LoupeSide, c: Point, clear: boolean): LoupePlace => ({ left: c.x - half, top: c.y - half, side, clear });

  for (const tier of tiers) {
    for (const keepPanelClear of onPanel ? [true, false] : [false]) {
      const blocked = keepPanelClear && onPanel ? [onFinger, onPanel] : [onFinger];
      const spots = tier
        .map((side) => ({ side, c: nearestFree(bands[side].range, bands[side].preferred, blocked) }))
        .filter((s): s is { side: LoupeSide; c: Point } => s.c !== null);
      if (spots.length === 0) continue;
      const kept = spots.find((s) => s.side === avoid.prefer);
      if (kept) return place(kept.side, kept.c, true);
      // The nearest the point; in a tie, the first in the tier
      let best = spots[0];
      for (const s of spots.slice(1)) if (distance(s.c, point) < distance(best.c, point) - 0.5) best = s;
      return place(best.side, best.c, true);
    }
  }

  // Nowhere clear: each band's spot kept inside the area, covering the least
  // of the box, and off the finger when any of them is
  let fallback: { side: LoupeSide; c: Point; onFinger: boolean; covered: number } | null = null;
  for (const side of tiers.flat()) {
    const { preferred } = bands[side];
    const c = { x: clampTo(preferred.x, inside.x1, inside.x2), y: clampTo(preferred.y, inside.y1, inside.y2) };
    const loupe = grow({ x1: c.x, y1: c.y, x2: c.x, y2: c.y }, half);
    const candidate = { side, c, onFinger: strictlyInside(c, onFinger), covered: overlapArea(loupe, box) };
    const better =
      !fallback ||
      (!candidate.onFinger && fallback.onFinger) ||
      (candidate.onFinger === fallback.onFinger && candidate.covered < fallback.covered - 0.5);
    if (better) fallback = candidate;
  }
  // tiers always has a side, so fallback is set
  const chosen = fallback!;
  return place(chosen.side, chosen.c, false);
}

/**
 * The square of the photo the loupe shows, image px, centred on the corner.
 * `displayScale` is image px to CSS px as the photo is shown now. Where the
 * square runs past the photo's edge only the part on the photo is drawn, at
 * its place in the loupe (`draw`, null when none of it is on the photo), and
 * the rest of the loupe stays dark.
 */
export function loupeSource(
  corner: Point,
  displayScale: number,
  magnification = LOUPE_MAGNIFICATION,
  size = LOUPE_SIZE_PX,
  imageSize: { width?: number; height?: number } = {},
) {
  const s = displayScale * magnification;
  const side = s > 0 && Number.isFinite(s) ? size / s : size;
  const sx = corner.x - side / 2;
  const sy = corner.y - side / 2;
  const iw = Number.isFinite(imageSize.width) ? (imageSize.width as number) : Infinity;
  const ih = Number.isFinite(imageSize.height) ? (imageSize.height as number) : Infinity;
  const cx1 = Math.max(sx, 0);
  const cy1 = Math.max(sy, 0);
  const cx2 = Math.min(sx + side, iw);
  const cy2 = Math.min(sy + side, ih);
  const toLoupe = size / side;
  const draw = cx2 > cx1 && cy2 > cy1
    ? {
      sx: cx1,
      sy: cy1,
      sw: cx2 - cx1,
      sh: cy2 - cy1,
      dx: (cx1 - sx) * toLoupe,
      dy: (cy1 - sy) * toLoupe,
      dw: (cx2 - cx1) * toLoupe,
      dh: (cy2 - cy1) * toLoupe,
    }
    : null;
  return { sx, sy, sw: side, sh: side, scale: toLoupe, draw };
}
