import { describe, it, expect } from "vitest";
import { snapPoints, clampSheet, nearestSnap } from "./sheetSnap";

/** Where the answers sheet rests on phones and tablets (9 Oct 2026). */
const points = snapPoints({ container: 700, header: 180, footer: 80, panel: 200 });

describe("snapPoints", () => {
  it("builds the points from the measured heights", () => {
    expect(points).toEqual({ collapsed: 260, half: 350, full: 692, panel: 420 });
  });

  it("caps the panel point at 60% of the container", () => {
    expect(snapPoints({ container: 700, header: 60, footer: 80, panel: 900 }).panel).toBe(420);
    expect(snapPoints({ container: 700, header: 60, footer: 80, panel: 100 }).panel).toBe(240);
  });

  it("never puts half or panel below collapsed", () => {
    const small = snapPoints({ container: 400, header: 180, footer: 80 });
    expect(small.half).toBe(260);
    expect(small.panel).toBe(260);
  });

  it("is all zeros before anything is measured", () => {
    expect(snapPoints({ container: 0, header: 0, footer: 0 })).toEqual({ collapsed: 0, half: 0, full: 0, panel: 0 });
  });
});

describe("clampSheet", () => {
  it("holds a drag between collapsed and full", () => {
    expect(clampSheet(100, points)).toBe(260);
    expect(clampSheet(900, points)).toBe(692);
    expect(clampSheet(400, points)).toBe(400);
  });
});

describe("nearestSnap", () => {
  it("goes to the nearest point on a slow release", () => {
    expect(nearestSnap(300, 0.1, points, "collapsed")).toBe("collapsed");
    expect(nearestSnap(330, 0, points, "collapsed")).toBe("half");
    expect(nearestSnap(600, -0.2, points, "half")).toBe("full");
  });

  it("goes one step up on an upward flick, whatever is nearest", () => {
    expect(nearestSnap(270, 0.8, points, "collapsed")).toBe("half");
    expect(nearestSnap(360, 0.8, points, "half")).toBe("full");
    expect(nearestSnap(692, 0.8, points, "full")).toBe("full");
  });

  it("goes one step down on a downward flick", () => {
    expect(nearestSnap(680, -0.8, points, "full")).toBe("half");
    expect(nearestSnap(340, -0.8, points, "half")).toBe("collapsed");
    expect(nearestSnap(260, -0.8, points, "collapsed")).toBe("collapsed");
  });
});

// The sheet under the full-screen photo (12 Oct 2026)
describe("snapPoints, compact", () => {
  it("rests on the handle alone, above the home indicator, with the footer left out", () => {
    const p = snapPoints({ container: 844, header: 44, footer: 76, panel: 260, compact: true, inset: 34 });
    expect(p.collapsed).toBe(78);
    expect(p.full).toBe(836);
    expect(p.half).toBe(422);
    // A box's panel takes what it needs: the handle, the panel and the footer
    expect(p.panel).toBe(380);
  });

  it("skips half on a phone held sideways, where it would show next to nothing", () => {
    const p = snapPoints({ container: 390, header: 44, footer: 76, panel: 260, compact: true, inset: 21 });
    expect(p.collapsed).toBe(65);
    expect(p.half).toBe(p.full);
    expect(p.full).toBe(382);
    expect(p.panel).toBe(380);
    // Half stays where it leaves at least 160 px to scroll
    expect(snapPoints({ container: 560, header: 44, footer: 76, compact: true }).half).toBe(280);
    expect(snapPoints({ container: 558, header: 44, footer: 76, compact: true }).half).toBe(550);
  });

  it("never puts a panel past full, and leaves the usual sheet as it was", () => {
    expect(snapPoints({ container: 390, header: 44, footer: 76, panel: 900, compact: true }).panel).toBe(382);
    expect(snapPoints({ container: 700, header: 180, footer: 80, panel: 200, inset: 34 })).toEqual(snapPoints({ container: 700, header: 180, footer: 80, panel: 200 }));
  });
});
