// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SurfaceTypeIcon } from "./sceneIcons";
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
    expect(svg("pavers").getAttribute("data-icon")).toBe("Bricks or paver blocks: small blocks laid in rows");
  });
});
