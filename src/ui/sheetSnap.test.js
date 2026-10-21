import { describe, it, expect } from "vitest";
import { snapPoints, clampSheet, nearestSnap, projectRelease, springStep, BODY_EDGE_PX } from "./sheetSnap";

/** Where the answers sheet rests on phones and tablets (9 Oct 2026). */
// Content taller than the screen, so half and full are where the screen puts them
const points = snapPoints({ container: 700, header: 180, footer: 80, panel: 2000 });

describe("snapPoints", () => {
  it("builds the points from the measured heights", () => {
    expect(points).toEqual({ collapsed: 260, half: 350, full: 692, panel: 420 });
  });

  it("caps the panel point at 60% of the container", () => {
    expect(snapPoints({ container: 700, header: 60, footer: 80, panel: 900 }).panel).toBe(420);
    // A short panel takes what it needs, its 1 px top border included
    expect(snapPoints({ container: 700, header: 60, footer: 80, panel: 100 }).panel).toBe(240 + BODY_EDGE_PX);
  });

  it("never puts half or panel below collapsed", () => {
    const small = snapPoints({ container: 400, header: 180, footer: 80 });
    expect(small.half).toBe(260);
    expect(small.panel).toBe(260);
  });

  it("is all zeros before anything is measured", () => {
    expect(snapPoints({ container: 0, header: 0, footer: 0 })).toEqual({ collapsed: 0, half: 0, full: 0, panel: 0 });
  });

  // 21 Oct 2026: pulling a short panel or list up left empty space under it
  it("never rests higher than the content needs", () => {
    const short = snapPoints({ container: 700, header: 180, footer: 80, panel: 120 });
    expect(short.full).toBe(260 + 120 + BODY_EDGE_PX);
    expect(short.half).toBe(350);
    expect(short.panel).toBe(short.full);
    // Shorter than half: half, full and the panel are all where the content ends
    const tiny = snapPoints({ container: 700, header: 180, footer: 80, panel: 40 });
    expect(tiny).toEqual({ collapsed: 260, half: 301, full: 301, panel: 301 });
    // Unmeasured content leaves the screen's heights
    expect(snapPoints({ container: 700, header: 180, footer: 80 }).full).toBe(692);
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
  it("goes to the nearest point when the finger lifts at rest", () => {
    expect(nearestSnap(300, 0, points, "collapsed")).toBe("collapsed");
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

  // 21 Oct 2026: where the release would come to rest, not where it was
  it("lands where a throw carries it, past half on a hard one", () => {
    expect(nearestSnap(270, 4, points, "collapsed")).toBe("full");
    expect(nearestSnap(690, -5, points, "full")).toBe("collapsed");
    // A slow drift upwards carries a little
    expect(nearestSnap(300, 0.2, points, "collapsed")).toBe("half");
  });

  it("counts points at the same height as one, so a flick still moves", () => {
    const tiny = snapPoints({ container: 700, header: 180, footer: 80, panel: 40 });
    expect(tiny[nearestSnap(262, 0.8, tiny, "collapsed")]).toBe(301);
    expect(nearestSnap(299, -0.8, tiny, "full")).toBe("collapsed");
  });
});

describe("projectRelease", () => {
  it("carries a release 99 ms worth of its speed", () => {
    expect(projectRelease(300, 1)).toBeCloseTo(399);
    expect(projectRelease(300, -0.5)).toBeCloseTo(250.5);
    expect(projectRelease(300, 0)).toBe(300);
    expect(projectRelease(300, Number.NaN)).toBe(300);
  });
});

describe("springStep", () => {
  /** Runs the spring at 60 frames a second; the displacements it went through */
  const run = (displacement, velocity, seconds) => {
    let x = displacement;
    let v = velocity;
    const path = [];
    for (let t = 0; t < seconds; t += 1 / 60) {
      ({ x, v } = springStep(x, v, 1 / 60));
      path.push(x);
    }
    return { x, v, path };
  };

  it("settles on its point in well under half a second, without passing it", () => {
    const { x, path } = run(300, 0, 0.45);
    expect(Math.abs(x)).toBeLessThan(0.5);
    expect(path.every((d) => d >= 0)).toBe(true);
  });

  it("starts at the speed it is given, and takes a push away from its point back without overshoot", () => {
    const first = springStep(0, 1000, 1 / 60);
    expect(first.x).toBeGreaterThan(10);
    const { x, path } = run(0, 1000, 0.6);
    expect(Math.abs(x)).toBeLessThan(0.5);
    expect(path.every((d) => d >= -1e-9)).toBe(true);
  });

  it("is exact, so the path does not depend on the frame rate", () => {
    let a = { x: 200, v: -500 };
    for (let i = 0; i < 6; i++) a = springStep(a.x, a.v, 1 / 60);
    const b = springStep(200, -500, 6 / 60);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.v).toBeCloseTo(b.v, 6);
  });
});

// The sheet under the full-screen photo (12 Oct 2026)
describe("snapPoints, compact", () => {
  it("rests on the handle alone, above the home indicator, with the footer left out", () => {
    const p = snapPoints({ container: 844, header: 44, footer: 76, panel: 2000, compact: true, inset: 34 });
    expect(p.collapsed).toBe(78);
    expect(p.full).toBe(836);
    expect(p.half).toBe(422);
    // A box's panel takes what it needs: the handle, the panel, its top border and the footer
    expect(snapPoints({ container: 844, header: 44, footer: 76, panel: 260, compact: true, inset: 34 }).panel).toBe(380 + BODY_EDGE_PX);
  });

  it("skips half on a phone held sideways, where it would show next to nothing", () => {
    const p = snapPoints({ container: 390, header: 44, footer: 76, panel: 2000, compact: true, inset: 21 });
    expect(p.collapsed).toBe(65);
    expect(p.half).toBe(p.full);
    expect(p.full).toBe(382);
    expect(snapPoints({ container: 390, header: 44, footer: 76, panel: 260, compact: true, inset: 21 }).panel).toBe(380 + BODY_EDGE_PX);
    // Half stays where it leaves at least 160 px to scroll
    expect(snapPoints({ container: 560, header: 44, footer: 76, compact: true }).half).toBe(280);
    expect(snapPoints({ container: 558, header: 44, footer: 76, compact: true }).half).toBe(550);
  });

  it("never puts a panel past full, and leaves the usual sheet as it was", () => {
    expect(snapPoints({ container: 390, header: 44, footer: 76, panel: 900, compact: true }).panel).toBe(382);
    expect(snapPoints({ container: 700, header: 180, footer: 80, panel: 200, inset: 34 })).toEqual(snapPoints({ container: 700, header: 180, footer: 80, panel: 200 }));
  });

  it("never rests higher than the content needs either (21 Oct 2026)", () => {
    const p = snapPoints({ container: 844, header: 44, footer: 76, panel: 260, compact: true, inset: 34 });
    expect(p.full).toBe(380 + BODY_EDGE_PX);
    expect(p.half).toBe(p.full);
  });
});
