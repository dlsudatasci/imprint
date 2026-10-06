/**
 * Box geometry shared by the annotation tool and the submit route.
 *
 * The canvas stores a box as its start corner plus a signed width and height,
 * so a box drawn up or to the left, or resized past its opposite edge, ends up
 * with a negative size. computeIoU assumes positive sizes, so those boxes broke
 * the reference answer key and every IoU match. normalizeMark fixes that
 * (4 Oct 2026), and clampMark clips a box to the image, since objects cut by
 * the image edge are boxed on their visible part (chapter_4.tex line 61).
 */

/** Side of the square model copy made in pipeline Step 3 (preprocessing). */
export const MODEL_COPY_SIZE = 640;

/**
 * Boxes under 400 square pixels in the 640 by 640 model copy were dropped from
 * the pre-annotations (pipeline_methodology.md section 8). That applies the
 * codebook's roughly 20 by 20 pixel minimum as an area, so thin poles are kept.
 */
export const MIN_MODEL_AREA_PX = 400;

const isPositiveFinite = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

/** A copy with x, y at the top-left corner and a positive width and height. */
export function normalizeMark(mark) {
  const { x, y, width, height } = mark;
  return {
    ...mark,
    x: Math.min(x, x + width),
    y: Math.min(y, y + height),
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

/**
 * Normalizes the mark, then clips it to [0, imageWidth] x [0, imageHeight].
 * Returns the mark unchanged when the image size is not known.
 */
export function clampMark(mark, imageWidth, imageHeight) {
  if (!isPositiveFinite(imageWidth) || !isPositiveFinite(imageHeight)) return mark;
  const m = normalizeMark(mark);
  const x1 = Math.min(Math.max(m.x, 0), imageWidth);
  const y1 = Math.min(Math.max(m.y, 0), imageHeight);
  const x2 = Math.min(Math.max(m.x + m.width, 0), imageWidth);
  const y2 = Math.min(Math.max(m.y + m.height, 0), imageHeight);
  return { ...m, x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function markArea(mark) {
  return Math.abs(mark.width) * Math.abs(mark.height);
}

/**
 * The box's area in the 640 by 640 model copy. The scale equals the stored
 * letterbox scale for both sources (Mapillary 1280 wide gives 0.5, ATLAS-3
 * 640 by 360 gives 1.0).
 */
export function modelCopyArea(mark, imageWidth, imageHeight) {
  const scale = MODEL_COPY_SIZE / Math.max(imageWidth, imageHeight);
  return markArea(mark) * scale * scale;
}

/** True when the box is under the codebook's minimum size. False if the image size is unknown. */
export function isBelowMinimumSize(mark, imageWidth, imageHeight) {
  if (!mark || !isPositiveFinite(imageWidth) || !isPositiveFinite(imageHeight)) return false;
  return modelCopyArea(mark, imageWidth, imageHeight) < MIN_MODEL_AREA_PX;
}

/**
 * A drawn box thinner than this many canvas (screen) pixels in either
 * direction is treated as an accidental click and discarded (6 Oct 2026, both
 * roles). Such slivers were too small to click, so they could never be
 * labelled or deleted.
 */
export const MIN_DRAWN_BOX_CANVAS_PX = 5;

/** True when a newly drawn box is too thin to keep, given the image-to-canvas scale. */
export function isTooSmallToKeep(mark, scale = 1) {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.abs(mark.width) * s < MIN_DRAWN_BOX_CANVAS_PX || Math.abs(mark.height) * s < MIN_DRAWN_BOX_CANVAS_PX;
}

/**
 * A point just inside the box's top-left corner, used to select a box with a
 * synthetic click. One pixel in, or half the size for a box narrower than two
 * pixels, so the point always lands inside the box however small it is.
 * Staying near the corner rather than the centre avoids selecting a smaller
 * box nested in the middle of this one.
 */
export function pointInsideMark(mark) {
  const m = normalizeMark(mark);
  return { x: m.x + Math.min(1, m.width / 2), y: m.y + Math.min(1, m.height / 2) };
}

/**
 * Small boxes are hard to click: a click counts only strictly inside a box, so
 * a click on a tiny box usually lands just off it and starts a new box
 * instead, and its panel never opens (6 Oct 2026, both roles). A click that
 * hits no box therefore also selects a small box (shorter side under
 * SMALL_BOX_CANVAS_PX screen pixels) within NEAR_HIT_CANVAS_PX of it. Larger
 * boxes keep the strict rule, so a new box can still be drawn right beside one.
 */
export const SMALL_BOX_CANVAS_PX = 12;
export const NEAR_HIT_CANVAS_PX = 6;

/** Distance from a point to a box, 0 inside it. Image pixels. */
export function distanceToMark(mark, x, y) {
  const m = normalizeMark(mark);
  const dx = Math.max(m.x - x, 0, x - (m.x + m.width));
  const dy = Math.max(m.y - y, 0, y - (m.y + m.height));
  return Math.hypot(dx, dy);
}

/**
 * Index of the small box nearest to a click that missed every box, within the
 * tolerance, or null. `scale` is the image-to-canvas scale.
 */
export function pickNearSmallBox(marks, x, y, scale = 1) {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const tolerance = NEAR_HIT_CANVAS_PX / s;
  let best = null;
  let bestDistance = Infinity;
  (marks || []).forEach((mark, index) => {
    if (!mark) return;
    const shorterSide = Math.min(Math.abs(mark.width), Math.abs(mark.height)) * s;
    if (shorterSide >= SMALL_BOX_CANVAS_PX) return;
    const d = distanceToMark(mark, x, y);
    if (d <= tolerance && d < bestDistance) {
      best = index;
      bestDistance = d;
    }
  });
  return best;
}
