// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SurfaceTypeIcon, EvennessIcon, RoadBarrierIcon } from "./sceneIcons";
import { SURFACE_TYPE_OPTIONS } from "@/util/validators/sceneQuestions.mjs";

/**
 * S23 C (12 Nov 2026): the Surface Type pictures in Step 3. S15 asked for
 * every picture in currentColor only, so a chosen answer turns primary. The
 * Tiles picture drew its glaze as three white strokes, which read as
 * scratches on the light card and nearly vanished when chosen.
 */
function svg(value: string) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<SurfaceTypeIcon value={value} />);
  return host.querySelector("svg")!;
}

const paints = (root: Element) =>
  Array.from(root.querySelectorAll("*")).flatMap((el) =>
    ["stroke", "fill"].filter((a) => el.hasAttribute(a)).map((a) => ({ tag: el.tagName, attr: a, value: el.getAttribute(a) })),
  );

describe("SurfaceTypeIcon", () => {
  it("draws Tiles in currentColor only, no white and no other colour", () => {
    const tiles = svg("tiles");
    expect(tiles).toBeTruthy();
    const painted = paints(tiles);
    expect(painted.length).toBeGreaterThan(0);
    for (const p of painted) expect(["currentColor", "none"], `${p.tag} ${p.attr}`).toContain(p.value);
  });

  it("describes Tiles as what is drawn, not as shiny", () => {
    const label = svg("tiles").getAttribute("data-icon")!;
    expect(label).toBe("Tiles: small squares in a tight grid");
    expect(label).not.toMatch(/shiny|glaze/i);
  });

  it("draws the Tiles grid tighter than the bricks, as plain squares with no offset rows", () => {
    // Every line of the tiles grid runs edge to edge (one segment per line);
    // the bricks' joints stop at each row, so they have more, shorter segments.
    const segments = (value: string) => {
      const paths = svg(value).querySelectorAll("path");
      return paths[paths.length - 1].getAttribute("d")!.split("M").filter(Boolean).length;
    };
    expect(segments("tiles")).toBe(7 + 5);
    expect(segments("pavers")).toBeGreaterThan(segments("tiles"));
  });

  it("still draws the other three in currentColor only, and labels pavers bricks first", () => {
    for (const value of SURFACE_TYPE_OPTIONS) {
      for (const p of paints(svg(value))) expect(["currentColor", "none"], `${value} ${p.tag} ${p.attr}`).toContain(p.value);
    }
    expect(svg("pavers").getAttribute("data-icon")).toBe("Bricks: small blocks laid in rows");
  });

  // S27 (13 Nov 2026): "Bricks", since paver blocks confused people. Stored value still pavers.
  it("says Bricks for pavers, with no paver in any label", () => {
    for (const value of SURFACE_TYPE_OPTIONS) expect(svg(value).getAttribute("data-icon")).not.toMatch(/paver/i);
  });
});

const render = (el: ReactElement) => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(el);
  return host;
};

/** Each joint across the paving as [dx, dy] on screen, from the building side to the curb */
const joints = (root: Element) =>
  Array.from(root.querySelectorAll("g[stroke-opacity='0.35'] path")).map((p) => {
    const [x1, y1, x2, y2] = p.getAttribute("d")!.replace(/[ML]/g, " ").trim().split(/\s+/).map(Number);
    return [x2 - x1, y2 - y1];
  });

/**
 * S27 (13 Nov 2026): Evenness asks whether the sidewalk tilts sideways. Sloped
 * (2) is higher at the building side than at the curb, the same all along it.
 * Flat (3) is level. 1 (Uneven) is no longer drawn.
 */
describe("EvennessIcon", () => {
  it("draws Sloped and Flat with their new data-icon, and nothing for 1 or any other value", () => {
    expect(render(<EvennessIcon value={2} />).querySelector("svg")!.getAttribute("data-icon")).toBe("Sloped: the sidewalk tilts sideways, down toward the road");
    expect(render(<EvennessIcon value={3} />).querySelector("svg")!.getAttribute("data-icon")).toBe("Flat: the sidewalk is level from side to side");
    for (const v of [1, 0, 4]) expect(render(<EvennessIcon value={v} />).innerHTML).toBe("");
  });

  it("tilts Sloped across the sidewalk, not along it: every joint drops the same, more than Flat's", () => {
    const sloped = joints(render(<EvennessIcon value={2} />));
    const flat = joints(render(<EvennessIcon value={3} />));
    expect(sloped.length).toBeGreaterThan(4);
    expect(sloped.length).toBe(flat.length);
    // The same all along its length: every joint has the same shape
    for (const j of sloped) { expect(j[0]).toBeCloseTo(sloped[0][0], 1); expect(j[1]).toBeCloseTo(sloped[0][1], 1); }
    for (const j of flat) { expect(j[0]).toBeCloseTo(flat[0][0], 1); expect(j[1]).toBeCloseTo(flat[0][1], 1); }
    // Down toward the road, plainly: the curb end of each joint is lower on screen by more than Flat's
    expect(sloped[0][0]).toBeCloseTo(flat[0][0], 1);
    expect(sloped[0][1] - flat[0][1]).toBeGreaterThan(5);
  });

  it("is still, in currentColor, with the person standing on it", () => {
    for (const v of [2, 3]) {
      const root = render(<EvennessIcon value={v} />);
      expect(root.querySelector("animate, animateTransform")).toBeNull();
      expect(root.querySelector("circle")).not.toBeNull();
      for (const p of paints(root.querySelector("svg")!)) expect(["currentColor", "none", "#fff"]).toContain(p.value);
    }
  });
});

/**
 * S27 (13 Nov 2026): Road Barrier is drawn in 3D like the other questions, the
 * same stretch of sidewalk with the curb, the road and a person on it. Until
 * then it was a plan seen from above, with a building line along the top.
 */
describe("RoadBarrierIcon", () => {
  const barrier = (v: boolean) => render(<RoadBarrierIcon value={v} />);

  it("keeps its data-icon for each answer", () => {
    expect(barrier(false).querySelector("svg")!.getAttribute("data-icon")).toBe("No barrier: only the curb between the sidewalk and the road");
    expect(barrier(true).querySelector("svg")!.getAttribute("data-icon")).toBe("Barrier: a railing between the sidewalk and the road");
  });

  it("draws the railing only for true", () => {
    expect(barrier(true).querySelectorAll("[data-part='railing']")).toHaveLength(1);
    expect(barrier(true).querySelectorAll("[data-part='railing'] path").length).toBeGreaterThan(5);
    expect(barrier(false).querySelector("[data-part='railing']")).toBeNull();
  });

  it("is a 3D picture, not the old plan: no building line, no plan shapes, a person and a lane line", () => {
    for (const v of [false, true]) {
      const root = barrier(v);
      const svgEl = root.querySelector("svg")!;
      expect(svgEl.getAttribute("viewBox")).not.toBe("2 1 60 60");
      const ds = Array.from(root.querySelectorAll("path")).map((p) => p.getAttribute("d")!);
      // The plan drew its building line, curb and lane line with H and V
      expect(ds.some((d) => /[HV]/.test(d))).toBe(false);
      expect(ds).not.toContain("M4 7H60");
      // The person standing on the sidewalk (head and shadow), and the lane line on the road
      expect(root.querySelectorAll("circle")).toHaveLength(1);
      expect(root.querySelectorAll("ellipse")).toHaveLength(1);
      expect(root.querySelector("path[stroke-dasharray]")).not.toBeNull();
      expect(root.querySelector("animate, animateTransform")).toBeNull();
      for (const p of paints(svgEl)) expect(["currentColor", "none", "#fff"]).toContain(p.value);
    }
  });
});
