import { describe, it, expect } from "vitest";
import { boxIsSolid, boxLabelColors, boxLineStyle, boxStrokeColor, defaultShapeStyle } from "./Shape";

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

  it("colours the label like the outline: blue drawn, green Yes, amber No or undecided", () => {
    expect(boxLabelColors(drawn)).toEqual({ background: "#004aad", text: "white" });
    expect(boxLabelColors(yes)).toEqual({ background: "#16a34a", text: "white" });
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
