/**
 * The magnifier shown while a box's corner is dragged on touch (contributors,
 * 9 Oct 2026, IMPRINT_contributor_mobile.md section 3.2), like the iPhone's
 * document scanner: the finger covers the corner, so the loupe shows the photo
 * under it. Pure placement and source maths. The tool paints it.
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

type Point = { x: number; y: number };

/**
 * The loupe's top-left corner in the photo area, CSS px: centred 96 px above
 * the finger, or 96 px below it when that would go above the area's top, and
 * kept 8 px inside the area's sides.
 */
export function loupePlacement(finger: Point, area: { width: number; height: number }, size = LOUPE_SIZE_PX) {
  const half = size / 2;
  const below = finger.y - LOUPE_OFFSET_PX - half < 0;
  const centreY = below ? finger.y + LOUPE_OFFSET_PX : finger.y - LOUPE_OFFSET_PX;
  const maxLeft = area.width - size - LOUPE_MARGIN_PX;
  const left = Math.max(LOUPE_MARGIN_PX, Math.min(finger.x - half, maxLeft));
  return { left, top: centreY - half, below };
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
