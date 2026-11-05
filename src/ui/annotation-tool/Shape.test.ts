import { describe, it, expect } from "vitest";
import { RectShape, boxIsSolid, boxLabelColors, boxLineStyle, boxStrokeColor, defaultShapeStyle, drawnBoxStyle } from "./Shape";
import { tokens } from "../tokens";

/**
 * The status colours and line style of a box in the default view (moved into
 * helpers so the landing page's preview draws boxes exactly as the tool does).
 */
const undecided = { editable: false, selected: false, isRejected: false, comment: "tree" };
const yes = { ...undecided, selected: true };
const no = { ...undecided, isRejected: true };
const drawnBlank = { editable: true, selected: false };
const drawn = { ...drawnBlank, comment: "bollard" };

describe("box status style", () => {
  it("dashes an undecided suggestion and a drawn box with no category, and draws the rest solid", () => {
    expect(boxIsSolid(undecided)).toBe(false);
    expect(boxIsSolid(drawnBlank)).toBe(false);
    expect(boxIsSolid({ ...drawnBlank, comment: "" })).toBe(false);
    expect(boxIsSolid(yes)).toBe(true);
    expect(boxIsSolid(no)).toBe(true);
    expect(boxIsSolid(drawn)).toBe(true);
  });

  it("colours the label like the outline: green drawn (5 Nov 2026), amber for every suggestion, answered or not", () => {
    expect(boxLabelColors(drawn)).toEqual({ background: "#16a34a", text: "white" });
    expect(boxLabelColors(yes)).toEqual({ background: "#d97706", text: "#111827" });
    expect(boxLabelColors(no)).toEqual({ background: "#d97706", text: "#111827" });
    expect(boxLabelColors(undecided)).toEqual({ background: "#d97706", text: "#111827" });
    for (const box of [drawn, yes, no, undecided]) {
      expect(boxLabelColors(box).background).toBe(boxStrokeColor(box));
    }
  });

  it("draws a decided box 3 px and solid, and an undecided one at the style's width, dashed 5 on 5", () => {
    expect(boxLineStyle({ selected: true })).toEqual({ width: 3, dash: [] });
    expect(boxLineStyle({ editable: true, comment: "tree" })).toEqual({ width: 3, dash: [] });
    expect(boxLineStyle({})).toEqual({ width: defaultShapeStyle.lineWidth, dash: [5, 5] });
    expect(boxLineStyle({ editable: true }, 4)).toEqual({ width: 4, dash: [5, 5] });
  });
});

/** A canvas that records each stroke with the style it was drawn in */
function recordingCanvas() {
  const strokes: Array<{ color: string; width: number; dash: number[] }> = [];
  let dash: number[] = [];
  const ctx = {
    strokeStyle: "",
    lineWidth: 0,
    fillStyle: "",
    font: "",
    shadowBlur: 0,
    shadowColor: "",
    save() {},
    restore() {},
    setLineDash(d: number[]) { dash = d; },
    strokeRect() { strokes.push({ color: String(ctx.strokeStyle), width: ctx.lineWidth, dash }); },
    fillRect() {},
    measureText: () => ({ width: 40 }),
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, fill() {}, fillText() {}, arc() {}, stroke() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes };
}

const paint = (data: Record<string, unknown>) => {
  const { ctx, strokes } = recordingCanvas();
  const shape = new RectShape({ id: "b", mark: { x: 10, y: 10, width: 50, height: 80, type: "RECT" }, ...data } as never, () => undefined, data.editable ? drawnBoxStyle : defaultShapeStyle);
  shape.paint(ctx, (m) => m, false, "Box #1");
  return strokes;
};

// S18 (4 Nov 2026): pilot participant 4 lost the dark blue of a drawn box
// against shadows, dark vehicles and the sky. Rans (5 Nov 2026): drawn boxes
// take the green confirmed obstructions had, and an answered suggestion stays
// amber, solid. Suggestions off the path or marked Not an object leave the photo.
describe("box colours from 5 Nov 2026", () => {
  it("draws a box the person drew green, dashed until it has a category, in one stroke", () => {
    expect(boxStrokeColor(drawn)).toBe("#16a34a");
    expect(boxStrokeColor(drawnBlank)).toBe(tokens.color.success);
    expect(paint(drawn)).toEqual([{ color: "#16a34a", width: 3, dash: [] }]);
    expect(paint(drawnBlank)).toEqual([{ color: "#16a34a", width: 2, dash: [5, 5] }]);
  });

  it("draws every suggestion amber, dashed until answered, then solid whether the answer is Yes or No", () => {
    for (const box of [undecided, yes, no]) expect(boxStrokeColor(box)).toBe("#d97706");
    expect(paint(undecided)).toEqual([{ color: "#d97706", width: 2, dash: [5, 5] }]);
    expect(paint(yes)).toEqual([{ color: "#d97706", width: 3, dash: [] }]);
    expect(paint(no)).toEqual([{ color: "#d97706", width: 3, dash: [] }]);
  });

  it("uses no fuchsia, no halo, and leaves the brand blue alone", () => {
    for (const box of [drawn, drawnBlank, yes, no, undecided]) {
      expect(boxStrokeColor(box)).not.toBe("#e879f9");
      expect(paint(box)).toHaveLength(1);
    }
    expect(tokens.color).not.toHaveProperty("drawn");
    expect(tokens.color.primary).toBe("#004aad");
  });
});
