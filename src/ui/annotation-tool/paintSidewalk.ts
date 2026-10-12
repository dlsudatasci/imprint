/**
 * Paints the annotator's sidewalk outline (Sidewalk step, 6 Oct 2026) on the
 * shapes canvas, before the boxes.
 *
 * The fill shows exactly what is stored: the union of the walking-space
 * polygons (cut outs were removed on 6 Oct 2026). The polygons are filled in
 * opaque blue on an offscreen canvas, which is copied onto the shapes canvas at
 * the fill's transparency. Filling each shape with a translucent colour instead
 * would make overlaps look darker, as if that area counted twice.
 *
 *   "edit"     the Sidewalk step: fill, solid blue strokes, the selected
 *              shape's point and edge handles, and the shape being drawn
 *   "overlay"  the Obstructions step: a faint fill only, as a guide
 *
 * With `touch` (annotators on a phone or tablet, 12 Oct 2026) the handles are
 * round and large enough for a finger, sized in CSS px so they keep their size
 * at any zoom. See sidewalkHandleRadii.
 */

type Point = { x: number; y: number };
type Polygon = { id: string; kind: "walk"; points: Point[] };

export interface SidewalkPaintState {
  mask: { noSidewalk: boolean; polygons: Polygon[] };
  draft: { kind: "walk"; points: Point[] } | null;
  preview: Point | null;
  selectedId: string | null;
  selectedPoint: number | null;
}

export interface SidewalkPaintOptions {
  mode: "edit" | "overlay";
  state: SidewalkPaintState;
  /** Image pixels to canvas coordinates, as for the boxes. */
  toCanvas: (p: Point) => Point;
  /** Hides the fill to check the edges against the photo (edit mode). */
  hideFill?: boolean;
  /** Whether the cursor is near enough the draft's first point to close it. */
  nearFirstPoint?: boolean;
  /** Finger-sized round handles (12 Oct 2026) */
  touch?: boolean;
  /** Stage px to CSS px, so touch handles keep their size on screen */
  displayScale?: number;
}

const WALK = "#2563eb";
const HANDLE = 6;

/**
 * The outline's handle sizes in stage px.
 *
 * Without `touch`, the mouse's sizes: a 6 px square on each point of the
 * selected shape, a 3 px dot in the middle of each edge and on each point of
 * the shape being drawn, and a 7 px first point while the pointer is near
 * enough to close the shape.
 *
 * With `touch`, circles sized in CSS px (divided by the display scale): 8 px
 * for a point, 6 for an edge dot and a point of the shape being drawn, and 12
 * for the first point once the shape has 3 points, since a phone has no hover
 * to grow it.
 */
export function sidewalkHandleRadii({ touch = false, displayScale = 1 }: { touch?: boolean; displayScale?: number } = {}) {
  if (!touch) return { touch: false, pointSquare: HANDLE, pointRadius: HANDLE / 2, edgeRadius: 3, draftRadius: 3, firstRadius: 7 };
  const s = displayScale > 0 && Number.isFinite(displayScale) ? displayScale : 1;
  return { touch: true, pointSquare: 0, pointRadius: 8 / s, edgeRadius: 6 / s, draftRadius: 6 / s, firstRadius: 12 / s };
}

let offscreen: HTMLCanvasElement | null = null;

function tracePath(ctx: CanvasRenderingContext2D, points: Point[], toCanvas: SidewalkPaintOptions["toCanvas"], close: boolean) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const c = toCanvas(p);
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  });
  if (close) ctx.closePath();
}

function paintFill(ctx: CanvasRenderingContext2D, polygons: Polygon[], toCanvas: SidewalkPaintOptions["toCanvas"], alpha: number) {
  if (typeof document === "undefined" || polygons.length === 0) return;
  const { width, height } = ctx.canvas;
  if (!offscreen) offscreen = document.createElement("canvas");
  if (offscreen.width !== width || offscreen.height !== height) {
    offscreen.width = width;
    offscreen.height = height;
  }
  const off = offscreen.getContext("2d");
  if (!off) return;
  off.setTransform(1, 0, 0, 1, 0, 0);
  off.clearRect(0, 0, width, height);
  off.setTransform(ctx.getTransform());

  // Opaque, so overlapping shapes fill to the same colour
  off.fillStyle = "rgb(37, 99, 235)";
  for (const polygon of polygons) {
    tracePath(off, polygon.points, toCanvas, true);
    off.fill();
  }

  // The transparency is applied once, to the union
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.drawImage(offscreen, 0, 0);
  ctx.restore();
}

function squareHandle(ctx: CanvasRenderingContext2D, c: Point, filled: boolean) {
  ctx.fillStyle = filled ? WALK : "white";
  ctx.strokeStyle = WALK;
  ctx.lineWidth = 1.5;
  ctx.fillRect(c.x - HANDLE / 2, c.y - HANDLE / 2, HANDLE, HANDLE);
  ctx.strokeRect(c.x - HANDLE / 2, c.y - HANDLE / 2, HANDLE, HANDLE);
}

function roundHandle(ctx: CanvasRenderingContext2D, c: Point, radius: number, fill: string) {
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = WALK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export function paintSidewalk(ctx: CanvasRenderingContext2D, options: SidewalkPaintOptions) {
  const { mode, state, toCanvas, hideFill = false, nearFirstPoint = false, touch = false, displayScale = 1 } = options;
  const { polygons } = state.mask;
  const radii = sidewalkHandleRadii({ touch, displayScale });

  if (mode === "overlay") {
    paintFill(ctx, polygons, toCanvas, 0.18);
    return;
  }

  if (!hideFill) paintFill(ctx, polygons, toCanvas, 0.35);

  ctx.save();
  for (const polygon of polygons) {
    const selected = polygon.id === state.selectedId;
    ctx.strokeStyle = WALK;
    ctx.lineWidth = selected ? 3 : 2;
    tracePath(ctx, polygon.points, toCanvas, true);
    ctx.stroke();
  }

  const selected = polygons.find((p) => p.id === state.selectedId);
  if (selected) {
    const n = selected.points.length;
    for (let i = 0; i < n; i++) {
      const a = selected.points[i];
      const b = selected.points[(i + 1) % n];
      roundHandle(ctx, toCanvas({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), radii.edgeRadius, "white");
    }
    selected.points.forEach((p, i) => {
      if (radii.touch) roundHandle(ctx, toCanvas(p), radii.pointRadius, i === state.selectedPoint ? WALK : "white");
      else squareHandle(ctx, toCanvas(p), i === state.selectedPoint);
    });
  }

  const { draft, preview } = state;
  if (draft && draft.points.length > 0) {
    const color = WALK;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    tracePath(ctx, draft.points, toCanvas, false);
    ctx.stroke();
    if (preview) {
      const last = toCanvas(draft.points[draft.points.length - 1]);
      const to = toCanvas(preview);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    draft.points.forEach((p, i) => {
      // On touch the first point is large as soon as the shape can be closed
      const enlarge = i === 0 && draft.points.length >= 3 && (radii.touch || nearFirstPoint);
      roundHandle(ctx, toCanvas(p), enlarge ? radii.firstRadius : radii.draftRadius, i === 0 ? color : "white");
    });
  }
  ctx.restore();
}
