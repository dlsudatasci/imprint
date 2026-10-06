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
}

const WALK = "#2563eb";
const HANDLE = 6;

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
  const { mode, state, toCanvas, hideFill = false, nearFirstPoint = false } = options;
  const { polygons } = state.mask;

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
      roundHandle(ctx, toCanvas({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), 3, "white");
    }
    selected.points.forEach((p, i) => squareHandle(ctx, toCanvas(p), i === state.selectedPoint));
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
      const enlarge = i === 0 && nearFirstPoint && draft.points.length >= 3;
      roundHandle(ctx, toCanvas(p), enlarge ? 7 : 3, i === 0 ? color : "white");
    });
  }
  ctx.restore();
}
