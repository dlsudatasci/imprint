import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));

import { useSession } from "next-auth/react";
import HowItWorks, { STILL_TICKS, TOUCH_STILL_TICKS } from "./HowItWorks";
import ClosingSection from "./ClosingSection";
import { HOW_IT_WORKS_COPY } from "./howItWorks/howItWorksCopy";
import { CLOSING_COPY } from "./closingCopy";
import { CHAPTERS, TICKS } from "./howItWorks/demoScript";
import { TOUCH_CHAPTERS } from "./howItWorks/touchScript";
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
