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
