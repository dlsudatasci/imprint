import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Step1Card, { STEP2_PARAGRAPH, step2PathParagraph } from "./Step1Card";
import { TRAY_COPY } from "@/features/annotate/objectTrays";

/**
 * Step 1's instructions above the photo (S16, then Rans's wording in S16b and
 * after his review of it, 3 Nov 2026), on the tool's desktop layout and in the
 * landing page's preview: one short paragraph naming the two questions by what
 * they ask, only the nearest of two sidewalks counting. From S18 (4 Nov 2026)
 * without "Question 1" and "Question 2", which pilot participant 4 found wordy.
 */
const decode = (html: string) => html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
const render = (props: { instructionsId?: string | null; pathOnly?: boolean; touch?: boolean } = {}) =>
  decode(renderToStaticMarkup(<Step1Card photo={<div data-photo />} answers={<div data-answers />} {...props} />));
const PARAGRAPH = "The dashed yellow boxes are suggested objects. Click each one, check its label, then answer whether it's on the sidewalk and whether it's an obstruction. If the photo shows two sidewalks, only the one nearest you counts. You can also drag your mouse to box objects on the sidewalk or path that we missed, whether or not they obstruct. Leave out objects that are not on the sidewalk.";

describe("Step1Card", () => {
  it("says it in one paragraph: the two questions, the two-sidewalks sentence and drawing a box", () => {
    const html = render();
    const block = html.match(/<div id="step1-instructions"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    const paragraphs = Array.from(block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g), (m) => m[1].trim());
    expect(paragraphs).toEqual([PARAGRAPH]);
    expect(html).toContain("If the photo shows two sidewalks, only the one nearest you counts.");
    // No question numbers (S18)
    expect(html).not.toMatch(/Question [12]/);
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
    expect(block).toContain("whether it's on the sidewalk and whether it's an obstruction");
    expect(render({ instructionsId: null })).not.toContain("id=");
  });

  it("no longer says to review objects on or beside the sidewalk, and has no em dash or semicolon", () => {
    expect(render()).not.toContain("on or beside the sidewalk");
    expect(render()).not.toMatch(/[—;]/);
  });
});

// S15 (9 Nov 2026): Step 1 asks whether there is a sidewalk, so this card is Step 2
describe("Step1Card as Step 2", () => {
  it("is headed Step 2", () => {
    expect(TRAY_COPY.stepHeading).toBe("Step 2: Identify Objects and Obstructions");
    expect(render()).toContain("Step 2: Identify Objects and Obstructions");
    expect(STEP2_PARAGRAPH).toBe(PARAGRAPH);
  });

  it("says the path paragraph once Step 1 is answered Only a path, with the mouse's or the finger's words", () => {
    const pointer = "The dashed yellow boxes are suggested objects. Click each one, check its label, then answer whether it obstructs the path. You can also drag your mouse to box objects on the path that we missed, whether or not they obstruct.";
    const touch = "The dashed yellow boxes are suggested objects. Tap each one, check its label, then answer whether it obstructs the path. You can also tap Add box to box objects on the path that we missed, whether or not they obstruct.";
    expect(step2PathParagraph()).toBe(pointer);
    expect(step2PathParagraph(true)).toBe(touch);
    expect(render({ pathOnly: true })).toContain(pointer);
    expect(render({ pathOnly: true })).not.toContain("on the sidewalk");
    expect(render({ pathOnly: true, touch: true })).toContain(touch);
    // A sidewalk, or Step 1 not answered yet: the paragraph above, whatever the input
    expect(render({ touch: true })).toContain(PARAGRAPH);
    for (const words of [pointer, touch]) expect(words).not.toMatch(/[—;]/);
  });
});
