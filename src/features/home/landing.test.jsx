import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));

import { useSession } from "next-auth/react";
import HowItWorks, { STILL_TICKS, TOUCH_STILL_TICKS } from "./HowItWorks";
import ClosingSection from "./ClosingSection";
import { HOW_IT_WORKS_COPY } from "./howItWorks/howItWorksCopy";
import { CLOSING_COPY } from "./closingCopy";
import { CHAPTERS, TICKS } from "./howItWorks/demoScript";
import { TOUCH_CHAPTERS, touchFrame, touchTickOf } from "./howItWorks/touchScript";
import { cityStatsItems } from "./cityStatsItems";

/** Every string in a copy object, functions called with sample numbers */
function strings(value) {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [value(1, 5)];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

beforeEach(() => vi.clearAllMocks());

describe("landing page copy", () => {
  it("has no em dashes and no semicolons", () => {
    for (const s of [...strings(HOW_IT_WORKS_COPY), ...strings(CLOSING_COPY)]) {
      expect(s).not.toMatch(/[—;]/);
    }
  });

  // S12 (2 Nov 2026): the two questions on every box, path first
  it("names both questions in the laptop chapters about the boxes, about as long as before", () => {
    const [first, answer, draw] = HOW_IT_WORKS_COPY.chapters;
    expect(first.title).toBe("Say what blocks your way");
    expect(first.text).toContain("on the sidewalk or the path people walk on");
    expect(first.text).toContain("obstructs your path");
    expect(first.text).toContain("rate its severity from 1 to 5");
    expect(first.text.indexOf("path people walk on")).toBeLessThan(first.text.indexOf("obstructs your path"));
    // Rans's wording (5 Nov 2026)
    expect(answer.text).toBe("Go through the rest the same way. If an object is off the sidewalk or not an obstruction, click No. If a box does not seem to be a real object, mark it Not an object.");
    expect(draw.title).toBe("Draw the objects we missed");
    expect(draw.text).toBe("Drag a box around any object on the sidewalk we missed, pick its category, and answer both questions.");
    expect(first.text).toMatch(/^We've already boxed the objects we found\. /);
    expect(HOW_IT_WORKS_COPY.touchChapters[2].title).toBe("Draw the objects we missed");
    expect(draw.text).toContain("answer both questions");
    expect(draw.text).not.toContain("the same question.");
    // About as long as the texts they replaced (167, 139 and 94 characters);
    // the second 165 from 5 Nov 2026 (Rans's wording)
    expect(first.text.length).toBeLessThanOrEqual(200);
    expect(answer.text.length).toBeLessThanOrEqual(170);
    // 101 from 5 Nov 2026 (Rans: any object on the sidewalk)
    expect(draw.text.length).toBeLessThanOrEqual(105);
    // Rate the sidewalk: the sidewalk nearest you, as in the tour and the guide (S16 follow-up, 3 Nov 2026)
    expect(HOW_IT_WORKS_COPY.chapters[3].text).toBe("Four quick questions about the sidewalk nearest you: how wide it is, its surface, how comfortable it looks, and whether you could get through.");
  });

  it("offers Not an object only where it is offered: the model's boxes, never a drawn one", () => {
    const [, answer, draw] = HOW_IT_WORKS_COPY.chapters;
    expect(answer.text).toContain("Not an object");
    expect(draw.text).not.toContain("Not an object");
  });

  it("has one caption per chapter of the preview, and one still per chapter", () => {
    expect(HOW_IT_WORKS_COPY.chapters).toHaveLength(CHAPTERS.length);
    expect(STILL_TICKS).toHaveLength(CHAPTERS.length);
    STILL_TICKS.forEach((tick) => {
      expect(tick).toBeGreaterThanOrEqual(0);
      expect(tick).toBeLessThanOrEqual(TICKS);
    });
  });

  it("on phones and tablets, has the same chapter titles, one still each, and Not an object only for the model's boxes", () => {
    expect(HOW_IT_WORKS_COPY.touchChapters).toHaveLength(TOUCH_CHAPTERS.length);
    expect(HOW_IT_WORKS_COPY.touchChapters.map((c) => c.title)).toEqual(HOW_IT_WORKS_COPY.chapters.map((c) => c.title));
    const [, answer, draw] = HOW_IT_WORKS_COPY.touchChapters;
    expect(answer.text).toContain("Not an object");
    expect(draw.text).not.toContain("Not an object");
    // Short enough for three lines on a 320 px phone (the band keeps room for three, 23 Oct 2026)
    for (const c of HOW_IT_WORKS_COPY.touchChapters) expect(c.text.length).toBeLessThanOrEqual(130);
    // The two about each box's questions (S12, 2 Nov 2026): at most two lines on
    // a 320 px phone, measured in Chrome at 71 and 66 characters
    expect(answer.text.length).toBeLessThanOrEqual(72);
    expect(draw.text.length).toBeLessThanOrEqual(72);
    expect(answer.text).toContain("walking path");
    expect(answer.text).toContain("In your way");
    expect(draw.text).toContain("both questions");
    // S16 follow-up (3 Nov 2026): the first chapter names the path question before the obstruction
    // question, as the preview plays it (Yes to the path, Yes, severity 1), in two lines at 320 and
    // 375 px (measured in Chrome at 71 characters)
    const [first, , , rate] = HOW_IT_WORKS_COPY.touchChapters;
    expect(first.text).toBe("Tap a box. On the walking path? In your way? Rate its severity, 1 to 5.");
    expect(first.text.indexOf("walking path")).toBeLessThan(first.text.indexOf("In your way"));
    expect(first.text.length).toBeLessThanOrEqual(72);
    // What the first chapter plays: Tree #1, Yes to the path question, Yes, severity 1
    expect(touchTickOf("tree-confirm", "end")).toBeLessThanOrEqual(TOUCH_CHAPTERS[1].start);
    const tree = touchFrame(touchTickOf("tree-confirm", "end") / TICKS).boxes.find((b) => b.comment === "tree");
    expect(tree).toMatchObject({ onSidewalk: true, selected: true, obstructs: true, severity: 1 });
    expect(touchTickOf("tree-sidewalk")).toBeLessThan(touchTickOf("tree-yes"));
    // Both "Rate the sidewalk" texts say which sidewalk
    expect(rate.text).toBe("Tap the Step 2 line and answer four questions about the sidewalk nearest you.");
    expect(HOW_IT_WORKS_COPY.chapters[3].text).toContain("the sidewalk nearest you");
    expect(TOUCH_STILL_TICKS).toHaveLength(TOUCH_CHAPTERS.length);
    TOUCH_STILL_TICKS.forEach((tick) => {
      expect(tick).toBeGreaterThanOrEqual(0);
      expect(tick).toBeLessThanOrEqual(TICKS);
    });
  });

  it("no longer says the sign-up collects only an email address, or that sidewalks are rated 1 to 10", () => {
    const all = [...strings(HOW_IT_WORKS_COPY), ...strings(CLOSING_COPY)].join(" ");
    expect(all).not.toMatch(/only collect your email/i);
    expect(all).not.toMatch(/1-10|1 to 10/);
  });
});

describe("HowItWorks (server render)", () => {
  it("puts the heading and every chapter in the server's HTML, with no skip link", () => {
    const html = renderToStaticMarkup(<HowItWorks />);
    expect(html).toContain('aria-labelledby="how-it-works-title"');
    expect(html).toContain('id="how-it-works-title"');
    expect(html).toContain(HOW_IT_WORKS_COPY.title);
    expect(html).not.toContain("Skip the preview");
    expect(html).not.toContain('href="#');
    for (const c of HOW_IT_WORKS_COPY.chapters) expect(html).toContain(c.title);
  });

  it("renders one screen of placeholder, not the 7-screen track, before the browser has answered", () => {
    const html = renderToStaticMarkup(<HowItWorks />);
    expect(html).not.toContain("data-track");
    expect(html).not.toContain("460svh");
  });
});

describe("ClosingSection", () => {
  it("offers visitors the way in", () => {
    useSession.mockReturnValue({ status: "unauthenticated" });
    const html = renderToStaticMarkup(<ClosingSection />);
    expect(html).toContain(CLOSING_COPY.ctaSignedOut);
    expect(html).toContain('href="/contribute"');
    expect(html).toContain(CLOSING_COPY.joinTitle);
    expect(html).toContain(CLOSING_COPY.joinText);
  });

  it("is the join card alone: no Metro Manila or impact sections (Rans, 15 Oct 2026)", () => {
    useSession.mockReturnValue({ status: "unauthenticated" });
    const html = renderToStaticMarkup(<ClosingSection />);
    expect(html).not.toContain("Sidewalk conditions in Metro Manila");
    expect(html).not.toContain("What your work goes toward");
    expect(html.match(/<section/g)).toHaveLength(1);
    // Plain: the heading, its line and the button, no picture or list
    expect(html).not.toMatch(/<(svg|img|ul)\b/);
  });

  it("sends anyone signed in to their dashboard", () => {
    useSession.mockReturnValue({ status: "authenticated", data: { user: {} } });
    const html = renderToStaticMarkup(<ClosingSection />);
    expect(html).toContain(CLOSING_COPY.ctaSignedIn);
    expect(html).not.toContain(CLOSING_COPY.ctaSignedOut);
  });

  it("shows no button while the session is loading", () => {
    useSession.mockReturnValue({ status: "loading" });
    const html = renderToStaticMarkup(<ClosingSection />);
    expect(html).not.toContain(CLOSING_COPY.ctaSignedIn);
    expect(html).not.toContain(CLOSING_COPY.ctaSignedOut);
  });
});

describe("the figures under the map", () => {
  const stats = { totalImages: 1200, totalAnnotations: 340, avgAccessibilityRating: 2.3, totalContributors: 12, avgObstructionsPerImage: 1.4 };
  const byLabel = (items) => Object.fromEntries(items.map((i) => [i.label, i]));

  it("says what each number counts, and which way the accessibility scale runs", () => {
    const items = byLabel(cityStatsItems(stats));
    expect(items.Annotations).toMatchObject({ value: "340", sub: "images annotated" });
    expect(JSON.stringify(items)).not.toContain("bounding boxes");
    // 1 Not accessible to 5 Easily accessible from 22 Oct 2026, said plainly (23 Oct 2026)
    expect(items.Accessibility.value).toBe("2.3");
    expect(items.Accessibility.sub).toBe("out of 5, higher is better");
    expect(items["Avg. Obstructions"]).toMatchObject({ value: "1.4", sub: "per image" });
    for (const item of cityStatsItems(stats)) expect(item.sub).not.toMatch(/[;—]/);
    expect(cityStatsItems(null)).toEqual([]);
  });
});

// Rans (5 Nov 2026): no "model" in the copy a new contributor reads first,
// except where the About page explains what Imprint is
describe("no model in the task's copy (5 Nov 2026)", () => {
  it("leaves model out of the landing preview's chapters and the empty-photo line under the photo", async () => {
    const { TRAY_COPY } = await import("@/features/annotate/objectTrays");
    for (const c of [...HOW_IT_WORKS_COPY.chapters, ...HOW_IT_WORKS_COPY.touchChapters]) {
      expect(`${c.title} ${c.text}`).not.toMatch(/\bmodel/i);
    }
    expect(TRAY_COPY.noObjects).toBe("No suggestions in this image. Draw a box around any object on the sidewalk we missed.");
    expect(TRAY_COPY.noObjectsTouch).toBe("No suggestions in this image. Tap Add box for any object on the sidewalk we missed.");
  });

  it("keeps the About page's model where Rans kept it, and changes the step about suggestions and drawing", async () => {
    const { ABOUT_COPY } = await import("@/features/about/aboutCopy");
    const [suggest, decide, , learns] = ABOUT_COPY.steps.items;
    expect(suggest).toEqual({ title: "Objects are suggested", text: "Before you see a street photo, we've already boxed the objects in it." });
    expect(decide.text).toMatch(/and draw any objects we missed\.$/);
    expect(learns.title).toBe("The model learns");
  });
});

// Rans (5 Nov 2026): every object on the sidewalk or the path is boxed,
// obstructing or not, so no text about drawing a box says obstruction
describe("drawing is about objects, not obstructions (5 Nov 2026)", () => {
  it("never ties drawing a box to obstructions, in the tool, the tour, the guide, the landing page or the About page", async () => {
    const [{ TRAY_COPY }, { buildTourSteps }, { GUIDE_COPY }, { ABOUT_COPY }, { renderToStaticMarkup }, { default: Step1Card }, React] = await Promise.all([
      import("@/features/annotate/objectTrays"),
      import("@/features/tutorial/tourSteps"),
      import("@/features/contribute/help/guideCopy"),
      import("@/features/about/aboutCopy"),
      import("react-dom/server"),
      import("@/ui/annotation-tool/Step1Card"),
      import("react"),
    ]);
    const card = renderToStaticMarkup(React.createElement(Step1Card, { photo: null, answers: null })).replace(/&#x27;/g, "'");
    const texts = [
      card,
      TRAY_COPY.noObjects,
      TRAY_COPY.noObjectsTouch,
      ...["pointer", "touch"].flatMap((input) => buildTourSteps(false, "objects", input).map((s) => s.content)),
      ...GUIDE_COPY.steps.flatMap((s) => [s.title, ...s.paragraphs]),
      ...[...HOW_IT_WORKS_COPY.chapters, ...HOW_IT_WORKS_COPY.touchChapters].flatMap((c) => [c.title, c.text]),
      ...ABOUT_COPY.steps.items.map((i) => i.text),
    ];
    // Every sentence about drawing, dragging, Add box or a missed object
    const drawing = texts.flatMap((t) => t.split(/(?<=[.?!])\s+/)).filter((s) => /\b(draw|drag (a box|your mouse|to box)|Add box|missed)\b/i.test(s));
    expect(drawing.length).toBeGreaterThanOrEqual(8);
    // "whether or not it obstructs" says the opposite of tying drawing to
    // obstructions: with those phrases taken out, no sentence says obstruct
    const neutral = /,? (whether or not (they|it) (obstructs?|is an obstruction)|even if it doesn't obstruct)/gi;
    for (const s of drawing) expect(s.replace(neutral, ""), s).not.toMatch(/obstruct/i);
    // And says so where people are told to draw (Rans, 5 Nov 2026)
    expect(card).toContain("You can also drag your mouse to box objects on the sidewalk or path that we missed, whether or not they obstruct. Leave out objects that are not on the sidewalk.");
    expect(GUIDE_COPY.steps.find((s) => s.id === "draw").paragraphs[0]).toMatch(/whether or not it is an obstruction\. Leave out objects that are not on the sidewalk\.$/);
    for (const t of [TRAY_COPY.noObjects, TRAY_COPY.noObjectsTouch, HOW_IT_WORKS_COPY.chapters[2].text]) expect(t).toContain("any object on the sidewalk we missed");
    expect(GUIDE_COPY.steps.find((s) => s.id === "draw").title).toBe("Draw the objects we missed");
  });
});
