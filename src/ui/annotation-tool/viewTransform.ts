/**
 * How the photo sits on the stage (9 Oct 2026, IMPRINT_contributor_mobile.md
 * sections 4.3 and 5).
 *
 * The fit letterboxes the photo into the stage. A view (zoom and pan: pinch
 * and pan by touch, and from S28, 13 Nov 2026, the Zoom in and Zoom out
 * buttons, the wheel and a trackpad pinch on a laptop) goes on top of it:
 * scaleState = applyView(fit, view). Everything that reads scaleState
 * (painting, calculateMousePosition, the transformer) then works zoomed with
 * no other change. At the identity view scaleState is the fit, number for number.
 *
 * Stage px throughout, apart from image sizes (image px).
 */

export interface Fit {
  originX: number;
  originY: number;
  scale: number;
}

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export interface PanLimits {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

type Size = { width: number; height: number };
type Rect = { x: number; y: number; width: number; height: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
/** ensureVisible keeps this much room around the box, stage px */
export const VISIBLE_MARGIN_PX = 12;

export const IDENTITY_VIEW: View = Object.freeze({ zoom: 1, panX: 0, panY: 0 });

/**
 * The letterbox fit, the maths the image load handler always used: the photo
 * fills the stage's width when it is wider than the stage, else its height,
 * and is centred on the other axis. null when a size is missing.
 */
export function fitImage(imageWidth: number, imageHeight: number, stageWidth: number, stageHeight: number): Fit | null {
  const imageRatio = imageHeight / imageWidth;
  const stageRatio = stageHeight / stageWidth;
  if (isNaN(imageRatio) || isNaN(stageRatio)) return null;
  if (imageRatio < stageRatio) {
    const scale = stageWidth / imageWidth;
    return { originX: 0, originY: (stageHeight - scale * imageHeight) / 2, scale };
  }
  const scale = stageHeight / imageHeight;
  return { originX: (stageWidth - scale * imageWidth) / 2, originY: 0, scale };
}

export function applyView(fit: Fit, view: View): Fit {
  return {
    scale: fit.scale * view.zoom,
    originX: fit.originX + view.panX,
    originY: fit.originY + view.panY,
  };
}

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(zoom) ? zoom : MIN_ZOOM));

/**
 * The view at `zoom` (clamped to 1 to 5) that puts the photo point now under
 * `anchor` at `target`. With anchor and target the same point, a zoom about
 * that point: it stays where it is. A pinch moves the target with the fingers'
 * midpoint, so moving both fingers pans. Pan limits are applied separately.
 */
export function zoomAt(fit: Fit, view: View, anchor: { x: number; y: number }, target: { x: number; y: number }, zoom: number): View {
  const now = applyView(fit, view);
  const imageX = (anchor.x - now.originX) / now.scale;
  const imageY = (anchor.y - now.originY) / now.scale;
  const z = clampZoom(zoom);
  const scale = fit.scale * z;
  return {
    zoom: z,
    panX: target.x - imageX * scale - fit.originX,
    panY: target.y - imageY * scale - fit.originY,
  };
}

/**
 * How far the photo may be panned at this zoom. Where the zoomed photo is
 * larger than the area its edge never comes inside the area's edge. Where it
 * is smaller it stays centred. `cover` is how much of the area's bottom the
 * sheet covers: the photo may then move up by as much, so a box under the
 * sheet can be brought into view (ensureVisible).
 */
export function panLimits(fit: Fit, zoom: number, area: Size, image: Size, cover = 0): PanLimits {
  const axis = (displayed: number, available: number, fitOrigin: number) => {
    if (displayed > available) return [available - displayed - fitOrigin, -fitOrigin];
    const centred = (available - displayed) / 2 - fitOrigin;
    return [centred, centred];
  };
  const scale = fit.scale * zoom;
  const [minX, maxX] = axis(image.width * scale, area.width, fit.originX);
  const [minY, maxY] = axis(image.height * scale, area.height, fit.originY);
  return { minX, maxX, minY: minY - Math.max(0, cover), maxY };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function clampView(view: View, limits: PanLimits): View {
  return {
    zoom: view.zoom,
    panX: clamp(view.panX, limits.minX, limits.maxX),
    panY: clamp(view.panY, limits.minY, limits.maxY),
  };
}

/**
 * The pan that brings the box (stage px, as shown now) inside the visible part
 * of the area with a margin, by the smallest shift that works, kept within the
 * limits (so never more than the sheet covers). A box larger than the visible
 * part is aligned to its top-left.
 */
export function ensureVisible(
  box: Rect,
  visible: Rect,
  pan: { panX: number; panY: number },
  limits: PanLimits,
  margin = VISIBLE_MARGIN_PX,
) {
  const shift = (start: number, size: number, from: number, length: number) => {
    const lo = from + margin;
    const hi = from + length - margin;
    if (size > hi - lo) return lo - start;
    if (start < lo) return lo - start;
    if (start + size > hi) return hi - (start + size);
    return 0;
  };
  const dx = shift(box.x, box.width, visible.x, visible.width);
  const dy = shift(box.y, box.height, visible.y, visible.height);
  return {
    panX: clamp(pan.panX + dx, limits.minX, limits.maxX),
    panY: clamp(pan.panY + dy, limits.minY, limits.maxY),
  };
}

/**
 * The view that keeps the photo where it is on the screen after the stage
 * changes size, as far as the limits allow (22 Oct 2026). `shown` is the
 * photo's top-left corner on the stage before the change (scaleState's
 * origin), `fit` the new fit. On a phone or tablet an opened box makes the
 * photo area taller (the top of the sheet gets shorter), and re-centring the
 * photo in it moved the photo down just as the sheet came up over it.
 */
export function keepPhotoInPlace(shown: { x: number; y: number }, fit: Fit, zoom: number, limits: PanLimits): View {
  return clampView({ zoom, panX: shown.x - fit.originX, panY: shown.y - fit.originY }, limits);
}

/**
 * Whether the photo area is the size the stage was measured at, so a view
 * worked out now will still be right once the screen settles (22 Oct 2026).
 * Opening a box changes three things one after another: where the sheet rests,
 * then the photo area's bottom (the sheet's resting edge, held in state), then
 * the stage measured from it. A move worked out in between used the old stage
 * with the new sheet. `measured` is the area's height on the page now and
 * `stage` the height the stage was measured at, null when either is not
 * known (no layout, as in tests), which counts as settled.
 */
export function photoAreaSettled(
  { measured, stage, edge, restingEdge }: { measured: number | null; stage: number | null; edge: number; restingEdge: number },
): boolean {
  if (edge !== restingEdge) return false;
  if (measured == null || stage == null || measured <= 0) return true;
  return Math.abs(measured - stage) <= 1;
}

/** One click of Zoom in or Zoom out on a laptop multiplies or divides the zoom by this (S28) */
export const ZOOM_STEP = 1.5;

/**
 * One click of Zoom in (direction 1) or Zoom out (-1) on a laptop (S28, 13 Nov
 * 2026): the zoom times or divided by ZOOM_STEP, clamped to 1 and MAX_ZOOM,
 * about `centre` (stage px), which stays where it is as far as the pan limits
 * allow. Reaching 1 is Fit: the identity view.
 */
export function zoomStep(fit: Fit, view: View, direction: 1 | -1, centre: { x: number; y: number }, area: Size, image: Size): View {
  const zoom = clampZoom(direction > 0 ? view.zoom * ZOOM_STEP : view.zoom / ZOOM_STEP);
  if (zoom <= MIN_ZOOM + 0.001) return IDENTITY_VIEW;
  return clampView(zoomAt(fit, view, centre, centre, zoom), panLimits(fit, zoom, area, image));
}

/**
 * A wheel or two-finger scroll over the zoomed photo on a laptop (S28): the
 * view moved by the scroll, in stage px, within the pan limits. `moved` is
 * false when the photo is already at its edge that way, so the page scrolls instead.
 */
export function panBy(fit: Fit, view: View, dx: number, dy: number, area: Size, image: Size): { view: View; moved: boolean } {
  const next = clampView({ zoom: view.zoom, panX: view.panX + dx, panY: view.panY + dy }, panLimits(fit, view.zoom, area, image));
  const moved = Math.abs(next.panX - view.panX) > 0.01 || Math.abs(next.panY - view.panY) > 0.01;
  return { view: moved ? next : view, moved };
}

/** A wheel event's delta in CSS px: lines (deltaMode 1) are 16 px, pages (2) the given page size */
export function wheelPixels(delta: number, deltaMode: number, page = 800) {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * page;
  return delta;
}
