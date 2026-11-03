import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Step1Card from "./Step1Card";
import { TRAY_COPY } from "@/features/annotate/objectTrays";

/**
 * Step 1's instructions above the photo (S16, then Rans's wording in S16b and
 * after his review of it, 3 Nov 2026), on the tool's desktop layout and in the
 * landing page's preview: one short paragraph naming the two questions by what
 * they ask, only the nearest of two sidewalks counting.
 */
const decode = (html: string) => html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
const render = (props: { instructionsId?: string | null } = {}) =>
  decode(renderToStaticMarkup(<Step1Card photo={<div data-photo />} answers={<div data-answers />} {...props} />));
const PARAGRAPH = "The dashed yellow boxes are suggested objects. Click each one and check its label, then answer Question 1 if it's on the sidewalk and Question 2 if it's an obstruction. If the photo shows two sidewalks, only the one nearest you counts. You can also drag to box objects that are obstructing the sidewalk.";

describe("Step1Card", () => {
  it("says it in one paragraph: the two questions, the two-sidewalks sentence and drawing a box", () => {
    const html = render();
    const block = html.match(/<div id="step1-instructions"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    const paragraphs = Array.from(block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g), (m) => m[1].trim());
    expect(paragraphs).toEqual([PARAGRAPH]);
    expect(html).toContain("If the photo shows two sidewalks, only the one nearest you counts.");
  });

  it("has no list and no line about where the answers are", () => {
    const html = render();
    expect(html).not.toContain("<ol");
    expect(html).not.toContain("<li");
    expect(html).not.toContain("Your answers are listed below the photo.");
    expect(TRAY_COPY).not.toHaveProperty("stepHint");
  });

  it("puts the heading and the instructions before the photo, then the answers", () => {
    const html = render();
    expect(html.indexOf(TRAY_COPY.stepHeading)).toBeLessThan(html.indexOf(PARAGRAPH));
    expect(html.indexOf("data-photo")).toBeGreaterThan(html.indexOf(PARAGRAPH));
    expect(html.indexOf("data-answers")).toBeGreaterThan(html.indexOf("data-photo"));
  });

  it("puts #step1-instructions on the heading and the instructions, for the tour's path step, and none when asked", () => {
    const block = render().match(/<div id="step1-instructions"[^>]*>([\s\S]*?)<div data-step1-well/)?.[1] ?? "";
    expect(block).toContain(TRAY_COPY.stepHeading);
    expect(block).toContain("Question 1 if it's on the sidewalk");
    expect(render({ instructionsId: null })).not.toContain("id=");
  });

  it("no longer says to review objects on or beside the sidewalk, and has no em dash or semicolon", () => {
    expect(render()).not.toContain("on or beside the sidewalk");
    expect(render()).not.toMatch(/[—;]/);
  });
});
