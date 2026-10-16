import { describe, it, expect } from "vitest";
import { panelPosition, PANEL_WIDTH, PANEL_ROOM_BELOW } from "./panelPosition";

const photo = { width: 715, height: 402 };

describe("panelPosition", () => {
  it("opens the panel to the right of the box, or to its left when the right would run off the photo", () => {
    expect(panelPosition({ x: 100, y: 50, width: 60 }, photo, 10)).toEqual({ left: 170, top: 50 });
    // 600 + 60 + 10 + 290 runs past 715, and 600 - 290 - 10 fits
    expect(panelPosition({ x: 600, y: 50, width: 60 }, photo, 10)).toEqual({ left: 600 - PANEL_WIDTH - 10, top: 50 });
    // Neither side fits: it stays on the right
    expect(panelPosition({ x: 200, y: 50, width: 400 }, { width: 700, height: 402 }, 10).left).toBe(610);
  });

  it("keeps the panel's top level with the box, but never too low on the photo or above it", () => {
    expect(panelPosition({ x: 100, y: 350, width: 60 }, photo, 10).top).toBe(photo.height - PANEL_ROOM_BELOW);
    expect(panelPosition({ x: 100, y: 10, width: 60 }, { width: 715, height: 100 }, 10).top).toBe(0);
  });
});
