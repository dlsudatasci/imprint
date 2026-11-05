import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { panelPosition, fitPanelTop, PANEL_WIDTH, PANEL_ROOM_BELOW } from "./panelPosition";

const photo = { width: 715, height: 402 };

describe("panelPosition", () => {
  it("opens the panel to the right of the box, or to its left when the right would run off the photo", () => {
    expect(panelPosition({ x: 100, y: 50, width: 60 }, photo, 10)).toEqual({ left: 170, top: 50 });
    // 600 + 60 + 10 + 280 runs past 715, and 600 - 280 - 10 fits
    expect(panelPosition({ x: 600, y: 50, width: 60 }, photo, 10)).toEqual({ left: 600 - PANEL_WIDTH - 10, top: 50 });
  });

  it("keeps the panel's top level with the box, but never too low on the photo or above it", () => {
    expect(panelPosition({ x: 100, y: 350, width: 60 }, photo, 10).top).toBe(photo.height - PANEL_ROOM_BELOW);
    expect(panelPosition({ x: 100, y: 10, width: 60 }, { width: 715, height: 100 }, 10).top).toBe(0);
  });
});

// S18 (4 Nov 2026): the panel ran past the photo's edge, where the frame cut it off
describe("panelPosition keeps the panel inside the photo (S18)", () => {
  const inside = (left: number, p: { width: number; left?: number }) => left >= (p.left ?? 0) && left + PANEL_WIDTH <= (p.left ?? 0) + p.width;

  it("is as wide as the panel card, w-[280px] in both panels", () => {
    expect(PANEL_WIDTH).toBe(280);
    for (const file of ["DefaultInputSection.tsx", "ObjectInputSection.tsx"]) {
      expect(readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).toContain(`w-[${PANEL_WIDTH}px]`);
    }
  });

  it("goes beside a box near either edge, inside the photo", () => {
    const nearLeft = panelPosition({ x: 2, y: 50, width: 40 }, photo, 10);
    expect(nearLeft.left).toBe(52);
    const nearRight = panelPosition({ x: 680, y: 50, width: 34 }, photo, 10);
    expect(nearRight.left).toBe(680 - PANEL_WIDTH - 10);
    for (const { left } of [nearLeft, nearRight]) expect(inside(left, photo)).toBe(true);
  });

  it("goes on the side with more room when neither fits, clamped to the photo, over part of the box", () => {
    const wide = { width: 700, height: 402 };
    // 200 px of room on the left, 100 on the right: left, clamped to 0
    expect(panelPosition({ x: 200, y: 50, width: 400 }, wide, 10).left).toBe(0);
    // 100 on the left, 200 on the right: right, clamped to the last place it fits
    expect(panelPosition({ x: 100, y: 50, width: 400 }, wide, 10).left).toBe(700 - PANEL_WIDTH);
    // A box as wide as the photo
    expect(panelPosition({ x: 0, y: 50, width: 700 }, wide, 10).left).toBe(700 - PANEL_WIDTH);
  });

  it("starts at the photo's left edge when the photo is narrower than the panel", () => {
    expect(panelPosition({ x: 20, y: 10, width: 40 }, { width: 200, height: 300 }, 10).left).toBe(0);
    expect(panelPosition({ x: 120, y: 10, width: 40 }, { width: 200, height: 300, left: 50 }, 10).left).toBe(50);
  });

  it("keeps to a letterboxed photo that starts right of the frame's edge", () => {
    const pillarbox = { left: 120, width: 720, height: 600 };
    expect(panelPosition({ x: 130, y: 10, width: 600 }, pillarbox, 10).left).toBe(120 + 720 - PANEL_WIDTH);
    expect(panelPosition({ x: 700, y: 10, width: 130 }, pillarbox, 10).left).toBe(700 - PANEL_WIDTH - 10);
    expect(panelPosition({ x: 300, y: 10, width: 500 }, pillarbox, 10).left).toBe(120);
  });

  it("never leaves the photo, for boxes all over photos of several widths", () => {
    for (const p of [{ width: 715, height: 402 }, { width: 960, height: 600 }, { width: 300, height: 400 }, { width: 560, height: 600, left: 200 }]) {
      const start = p.left ?? 0;
      for (let x = start; x < start + p.width; x += 17) {
        for (const w of [4, 40, 150, 300, 600]) {
          const { left } = panelPosition({ x, y: 30, width: Math.min(w, start + p.width - x) }, p, 10);
          if (p.width >= PANEL_WIDTH) expect(inside(left, p)).toBe(true);
          else expect(left).toBe(start);
        }
      }
    }
  });
});

describe("fitPanelTop (16 Oct 2026)", () => {
  it("leaves a panel that ends on the photo where it is", () => {
    expect(fitPanelTop(380, 220, 600)).toBe(380);
    expect(fitPanelTop(100, 283, 600)).toBe(100);
    expect(fitPanelTop(0, 600, 600)).toBe(0);
  });

  it("moves a taller panel up until it ends at the photo's bottom", () => {
    // A suggestion answered Yes, with its severity row, measured 245 px in Chromium
    expect(fitPanelTop(380, 245, 600)).toBe(355);
    expect(fitPanelTop(380, 283, 600)).toBe(317);
  });

  it("never moves it above the photo's top", () => {
    expect(fitPanelTop(380, 700, 600)).toBe(0);
  });
});
