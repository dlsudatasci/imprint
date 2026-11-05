import { describe, it, expect } from "vitest";
import Transformer, { MOUSE_HANDLE_DOT_PX, MOUSE_HANDLE_HIT_PX } from "./Transformer";
import { RectShape, defaultShapeStyle, drawnBoxStyle } from "./Shape";
import { TOUCH_HANDLE_DOT_PX } from "./touchGeometry";

/**
 * A box's handles (Rans, 5 Nov 2026): on the desktop the mouse's eight
 * handles are white dots ringed in the box's colour, as the touch corners
 * are, in place of the dark squares, and the whole dot can be grabbed.
 */
type Op = { op: string; [key: string]: unknown };

/** A canvas that records what is drawn, with the style each was drawn in */
function recordingCanvas() {
  const ops: Op[] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    shadowColor: "",
    shadowBlur: 0,
    save() {},
    restore() {},
    setLineDash() {},
    beginPath() {},
    arc(x: number, y: number, r: number) { ops.push({ op: "arc", x, y, r }); },
    fill() { ops.push({ op: "fill", color: ctx.fillStyle }); },
    stroke() { ops.push({ op: "stroke", color: ctx.strokeStyle, width: ctx.lineWidth }); },
    fillRect() { ops.push({ op: "fillRect" }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

const box = (data: Record<string, unknown> = {}) =>
  new RectShape(
    { id: "b", mark: { x: 100, y: 50, width: 200, height: 80, type: "RECT" }, editable: false, selected: false, comment: "car", ...data } as never,
    () => undefined,
    data.editable ? drawnBoxStyle : defaultShapeStyle
  );

const paint = (transformer: Transformer) => {
  const { ctx, ops } = recordingCanvas();
  transformer.paint(ctx, (m) => m, 1);
  return ops;
};

describe("the mouse's handles (5 Nov 2026)", () => {
  it("are eight white dots ringed in the box's colour, at the corners and the edges' middles, and no squares", () => {
    const ops = paint(new Transformer(box(), 1, "mouse", 1));
    expect(ops.filter((o) => o.op === "fillRect")).toHaveLength(0);
    const arcs = ops.filter((o) => o.op === "arc");
    expect(arcs.map((a) => [a.x, a.y])).toEqual([
      [100, 50], [200, 50], [300, 50], [100, 90], [300, 90], [100, 130], [200, 130], [300, 130],
    ]);
    for (const a of arcs) expect(a.r).toBe(MOUSE_HANDLE_DOT_PX);
    expect(ops.filter((o) => o.op === "fill").every((o) => o.color === "#ffffff")).toBe(true);
    expect(ops.filter((o) => o.op === "stroke").every((o) => o.color === "#d97706" && o.width === 2)).toBe(true);
    // A drawn box's ring is its green
    expect(paint(new Transformer(box({ editable: true }), 1, "mouse", 1)).filter((o) => o.op === "stroke").every((o) => o.color === "#16a34a")).toBe(true);
  });

  it("keep their size on screen: the radius is CSS px, divided by the stage's CSS scale", () => {
    const arcs = paint(new Transformer(box(), 1, "mouse", 0.75)).filter((o) => o.op === "arc");
    for (const a of arcs) expect(a.r).toBe(MOUSE_HANDLE_DOT_PX / 0.75);
    // Smaller than a finger's
    expect(MOUSE_HANDLE_DOT_PX).toBeLessThan(TOUCH_HANDLE_DOT_PX);
  });

  it("are grabbed anywhere on the dot: within 7 CSS px of the centre, at any zoom or stage scale", () => {
    expect(MOUSE_HANDLE_HIT_PX).toBeGreaterThanOrEqual(MOUSE_HANDLE_DOT_PX);
    for (const [scale, canvasScale] of [[1, 1], [2, 1], [1, 0.75], [0.5, 1.2]]) {
      const t = new Transformer(box(), scale, "mouse", canvasScale);
      const reach = MOUSE_HANDLE_HIT_PX / (scale * canvasScale);
      // The right edge's middle handle, at (300, 90) in image px
      expect(t.checkBoundary(300 + reach * 0.95, 90)).toBe(true);
      expect(t.checkBoundary(300, 90 - reach * 0.95)).toBe(true);
      expect(t.checkBoundary(300 + reach * 1.1, 90)).toBe(false);
    }
  });
});

describe("the touch handles, as they were (9 Oct 2026)", () => {
  it("are four white corner dots, 10 px, ringed 2.5 px, and none on a rejected box", () => {
    const ops = paint(new Transformer(box(), 1, "touch", 1));
    const arcs = ops.filter((o) => o.op === "arc");
    expect(arcs.map((a) => [a.x, a.y])).toEqual([[100, 50], [300, 50], [300, 130], [100, 130]]);
    for (const a of arcs) expect(a.r).toBe(TOUCH_HANDLE_DOT_PX);
    expect(ops.filter((o) => o.op === "stroke").every((o) => o.width === 2.5)).toBe(true);
    expect(paint(new Transformer(box({ isRejected: true }), 1, "touch", 1))).toEqual([]);
  });
});
