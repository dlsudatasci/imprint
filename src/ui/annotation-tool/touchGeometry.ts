import { normalizeMark, clampPointToImage } from "@/util/boxGeometry";
import type { Corner, Point } from "./touchGesture";

/**
 * Geometry for touch and pen on the photo (contributors, 9 Oct 2026,
 * IMPRINT_contributor_mobile.md sections 2.3 and 3). Pure: the tool passes
 * every size in and converts between CSS px, stage px and image px.
 */

/** A corner handle's touch target radius, CSS px: a 44 px target (Apple HIG, Material). */
export const TOUCH_HANDLE_HIT_PX = 22;
/** A corner handle's drawn radius, CSS px. */
export const TOUCH_HANDLE_DOT_PX = 10;
/** A corner never comes closer than this to the opposite sides, CSS px, so a box never flips or collapses. */
export const TOUCH_MIN_SIDE_PX = 16;
/** The smallest side of a box placed by Add box, CSS px. */
export const ADD_BOX_MIN_SIDE_PX = 48;
/** Add box: the share of the visible photo the new box covers on each side. */
export const ADD_BOX_SHARE = 0.3;
/** pickNearSmallBox tolerances for a finger, CSS px (the mouse uses 6 and 12). */
export const TOUCH_NEAR_PX = 12;
export const TOUCH_SMALL_BOX_PX = 24;

type Rect = { left: number; top: number; width: number; height: number };
type Mark = { x: number; y: number; width: number; height: number; type?: string };

/**
 * A pointer's position in stage px. The canvas may be shrunk with a CSS scale,
 * so offsetX is not used: the bounding box gives the canvas's size on screen.
 */
export function clientToStage(clientX: number, clientY: number, rect: Rect, stageWidth: number, stageHeight: number): Point {
  const sx = rect.width > 0 ? stageWidth / rect.width : 1;
  const sy = rect.height > 0 ? stageHeight / rect.height : 1;
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
}

/** CSS px on screen to image px. `scale` is image to stage, `canvasScale` stage to CSS. */
export function cssToImage(px: number, scale: number, canvasScale: number): number {
  const s = scale * canvasScale;
  return s > 0 && Number.isFinite(s) ? px / s : px;
}

/** The corners of a box: top-left, top-right, bottom-right, bottom-left. */
export function markCorners(mark: Mark): Point[] {
  const m = normalizeMark(mark);
  return [
    { x: m.x, y: m.y },
    { x: m.x + m.width, y: m.y },
    { x: m.x + m.width, y: m.y + m.height },
    { x: m.x, y: m.y + m.height },
  ];
}

/** The nearest corner within `radius` of the point, or null. Same units for all three. */
export function pickCorner(mark: Mark, point: Point, radius: number): Corner | null {
  let best: Corner | null = null;
  let bestDistance = Infinity;
  markCorners(mark).forEach((corner, index) => {
    const d = Math.hypot(point.x - corner.x, point.y - corner.y);
    if (d <= radius && d < bestDistance) {
      best = index as Corner;
      bestDistance = d;
    }
  });
  return best;
}

/**
 * The box with one corner moved to follow the finger, image px.
 *
 * The opposite corner stays where it was. The corner keeps the offset it had
 * from the finger at the press (`grabOffset`, finger minus corner), so it does
 * not jump under the finger. It stops `minSide` short of the opposite sides,
 * and the result is clamped to the photo.
 */
export function moveCorner(
  markAtStart: Mark,
  corner: Corner,
  point: Point,
  grabOffset: Point,
  minSide: number,
  imageWidth?: number,
  imageHeight?: number,
) {
  const m = normalizeMark(markAtStart);
  const x1 = m.x;
  const y1 = m.y;
  const x2 = m.x + m.width;
  const y2 = m.y + m.height;
  let cx = point.x - grabOffset.x;
  let cy = point.y - grabOffset.y;
  const left = corner === 0 || corner === 3;
  const top = corner === 0 || corner === 1;
  cx = left ? Math.min(cx, x2 - minSide) : Math.max(cx, x1 + minSide);
  cy = top ? Math.min(cy, y2 - minSide) : Math.max(cy, y1 + minSide);
  ({ x: cx, y: cy } = clampPointToImage(cx, cy, imageWidth, imageHeight));
  const nx1 = left ? cx : x1;
  const nx2 = left ? x2 : cx;
  const ny1 = top ? cy : y1;
  const ny2 = top ? y2 : cy;
  return {
    ...m,
    x: Math.min(nx1, nx2),
    y: Math.min(ny1, ny2),
    width: Math.abs(nx2 - nx1),
    height: Math.abs(ny2 - ny1),
  };
}

/**
 * Where Add box places its box, image px: centred on the visible part of the
 * photo, 30% of its width by 30% of its height, at least `minSide` a side
 * (ADD_BOX_MIN_SIDE_PX converted to image px), and inside the photo.
 */
export function addBoxPlacement(
  visibleImageRect: { x: number; y: number; width: number; height: number },
  imageSize: { width?: number; height?: number },
  minSide = 0,
) {
  const { width: iw, height: ih } = imageSize;
  const known = Number.isFinite(iw) && Number.isFinite(ih) && (iw as number) > 0 && (ih as number) > 0;
  let width = Math.max(visibleImageRect.width * ADD_BOX_SHARE, minSide);
  let height = Math.max(visibleImageRect.height * ADD_BOX_SHARE, minSide);
  if (known) {
    width = Math.min(width, iw as number);
    height = Math.min(height, ih as number);
  }
  let x = visibleImageRect.x + visibleImageRect.width / 2 - width / 2;
  let y = visibleImageRect.y + visibleImageRect.height / 2 - height / 2;
  if (known) {
    x = Math.min(Math.max(x, 0), (iw as number) - width);
    y = Math.min(Math.max(y, 0), (ih as number) - height);
  }
  return { x, y, width, height, type: "RECT" as const };
}
