import { describe, it, expect } from "vitest";
import { sidewalkHandleRadii } from "./paintSidewalk";

/** The sidewalk outline's handle sizes, for the mouse and for a finger (12 Oct 2026). */
describe("sidewalkHandleRadii", () => {
  it("keeps the mouse's sizes without touch, whatever the display scale", () => {
    const mouse = { touch: false, pointSquare: 6, pointRadius: 3, edgeRadius: 3, draftRadius: 3, firstRadius: 7 };
    expect(sidewalkHandleRadii()).toEqual(mouse);
    expect(sidewalkHandleRadii({ touch: false, displayScale: 0.5 })).toEqual(mouse);
  });

  it("gives finger-sized circles with touch: 8 for a point, 6 for an edge dot and a drawn point, 12 for the first point", () => {
    expect(sidewalkHandleRadii({ touch: true, displayScale: 1 })).toEqual({ touch: true, pointSquare: 0, pointRadius: 8, edgeRadius: 6, draftRadius: 6, firstRadius: 12 });
  });

  it("divides the touch sizes by the display scale, so they keep their size on screen", () => {
    expect(sidewalkHandleRadii({ touch: true, displayScale: 0.5 })).toMatchObject({ pointRadius: 16, edgeRadius: 12, draftRadius: 12, firstRadius: 24 });
    expect(sidewalkHandleRadii({ touch: true, displayScale: 0 })).toMatchObject({ pointRadius: 8 });
  });
});
