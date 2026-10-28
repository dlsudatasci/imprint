// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// The drawings are covered by DemoStage.test.jsx and TouchStage.test.jsx.
// Here they are a stand-in, so these tests are about the section: which
// preview shows, and its controls. Only the phone and tablet frames have a
// sheet (`snap`), so the stand-in says which script it is playing.
vi.mock("next/dynamic", () => ({
  default: () => (props) => <div data-stage data-tick={props.frame.tick} data-touch={String(props.frame.snap !== undefined)} data-coarse={String(Boolean(props.coarse))} />,
}));

import HowItWorks, { LEAD_IN, TOUCH_STILL_TICKS, TRACK_SCREENS, chapterShare } from "./HowItWorks";
import { CHAPTERS, ENTRANCE_END, TICKS, chapterAt } from "./howItWorks/demoScript";
import { HOW_IT_WORKS_COPY as COPY } from "./howItWorks/howItWorksCopy";
import { SHEET_LAYOUT_QUERY, TOUCH_DEVICE_QUERY } from "@/hooks/useAnnotateLayout";

let root = null;
let host = null;
const realMatchMedia = window.matchMedia;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  window.matchMedia = realMatchMedia;
});

function render({ reduced, narrow = false, coarse = false }) {
  const answers = { "(prefers-reduced-motion: reduce)": reduced, [SHEET_LAYOUT_QUERY]: narrow, [TOUCH_DEVICE_QUERY]: coarse };
  window.matchMedia = (query) => ({
    matches: answers[query] ?? false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<HowItWorks />));
  return host;
}

describe("HowItWorks", () => {
  it("plays the preview with the scroll: a track TRACK_SCREENS tall with a sticky frame, the drawing inert", () => {
    const el = render({ reduced: false });
    const track = el.querySelector("[data-track]");
    expect(track.className).toContain(`h-[${Math.round(TRACK_SCREENS * 100)}svh]`);
    expect(track.className).toContain(`h-[${Math.round(TRACK_SCREENS * 100)}vh]`);
    expect(track.firstElementChild.className).toContain("sticky");
    const stage = el.querySelector("[data-stage]");
    expect(stage.closest("[inert]")).not.toBeNull();
    expect(stage.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(el.textContent).not.toContain("Next step");
    // Framed like the map, in the page's own margins like the hero, the map and the figures (28 Oct 2026)
    const frame = stage.closest(".rounded-card");
    expect(frame.className).toContain("border-line");
    expect(frame.closest(".max-w-7xl")).not.toBeNull();
    expect(frame.closest(".max-w-\\[1600px\\]")).toBeNull();
    // At most 760 px tall, centred in the screen: the height the close shot of the photo and its
    // lists needs at the full 840 px width, so a big screen shows no empty band under them
    const row = el.querySelector("[data-frame]");
    expect(row.className).toContain("max-h-[760px]");
    expect(row.parentElement.className).toContain("justify-center");
  });

  it("starts half a screen early, the frame growing in as it arrives, in step with the script", () => {
    // The script's ENTRANCE_END is the tick the frame pins at
    expect(ENTRANCE_END).toBe(Math.round((TICKS * LEAD_IN) / (TRACK_SCREENS - 1 + LEAD_IN)));
    // Before it has arrived (jsdom has no layout: progress 0), the frame is drawn smaller
    const el = render({ reduced: false });
    expect(el.querySelector("[data-frame]").style.transform).toBe("scale(0.88)");
  });

  it("shows the chapters as steps on a line left of the preview, filling its height, the first one open (28 Oct 2026)", () => {
    const el = render({ reduced: false });
    const row = el.querySelector("[data-frame]");
    const rail = row.querySelector("[data-rail]");
    // Left of the preview, in the row that grows in as it arrives, and no card over the photo
    expect(row.firstElementChild).toBe(rail);
    expect(row.lastElementChild.querySelector("[data-stage]")).not.toBeNull();
    expect(el.querySelector("[data-caption]")).toBeNull();
    const cards = Array.from(rail.querySelectorAll("[data-step]"));
    expect(cards.map((c) => c.dataset.step)).toEqual(["open", "next", "next", "next", "next"]);
    cards.forEach((card, i) => expect(card.textContent).toContain(COPY.chapters[i].title));
    cards.forEach((card, i) => expect(card.textContent.startsWith(String(i + 1))).toBe(true));
    expect(cards[0].textContent).toContain(COPY.chapters[0].text);
    // The open step's text is unfolded, the others folded to their title
    const unfold = (card) => card.querySelector("[data-unfold]").className;
    expect(unfold(cards[0])).toContain("grid-rows-[1fr]");
    cards.slice(1).forEach((card) => expect(unfold(card)).toContain("grid-rows-[0fr]"));
    // A line runs from each step down to the next, none under the last, and the one under the
    // open step fills with the scroll through it: nothing yet at the top (jsdom has no layout)
    cards.slice(0, -1).forEach((card) => expect(card.querySelector("[data-step-bar]")).not.toBeNull());
    expect(cards.at(-1).querySelector("[data-step-bar]")).toBeNull();
    cards.slice(0, -1).forEach((card) => expect(card.querySelector("[data-step-bar]").style.transform).toBe("scaleY(0)"));
    // No boxes: the space between the steps is the line (Rans, 28 Oct 2026)
    cards.forEach((card) => expect(card.className).not.toMatch(/(^|\s)(border|rounded-card|shadow-lg)(\s|$)/));
    // The steps fill the rail's height beside the preview: each but the last a share, the open
    // one three, the share moving on the fold's curve. The last takes only what it needs, so the
    // line always ends on it at the rail's foot
    cards.forEach((card) => expect(card.className).toContain("transition-[flex-grow"));
    cards.slice(0, -1).forEach((card) => expect(card.className).toContain("basis-0"));
    expect(cards[0].className).toContain("grow-[3]");
    cards.slice(1, -1).forEach((card) => expect(card.className).toMatch(/(^|\s)grow(\s|$)/));
    expect(cards.at(-1).className).toContain("grow-0");
    expect(cards.at(-1).className).not.toContain("basis-0");
    // Nothing in it for screen readers or the keyboard: they get the list in the heading
    expect(rail.querySelectorAll("button, a, [tabindex]")).toHaveLength(0);
    rail.querySelectorAll("p").forEach((p) => expect(p.closest('[aria-hidden="true"]')).not.toBeNull());
  });

  it("has no progress line along the preview's bottom on a laptop: the open card's bar shows how far through (28 Oct 2026)", () => {
    const el = render({ reduced: false });
    const preview = el.querySelector("[data-frame]").lastElementChild;
    expect(preview.querySelector("[data-stage]")).not.toBeNull();
    expect(preview.querySelector(".bottom-0, .bg-primary")).toBeNull();
    expect(el.querySelector('[data-step="open"] [data-step-bar]')).not.toBeNull();
  });

  it("tells the rail how far through its chapter the scroll is, in step with the captions", () => {
    CHAPTERS.forEach((c, i) => {
      expect(chapterShare(c.start)).toEqual({ index: i, share: 0 });
      const stop = i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].start : TICKS;
      expect(chapterShare((c.start + stop) / 2).share).toBeCloseTo(0.5);
      expect(chapterShare((c.start + stop) / 2).index).toBe(chapterAt((c.start + stop) / 2));
    });
    expect(chapterShare(TICKS)).toEqual({ index: CHAPTERS.length - 1, share: 1 });
  });

  it("with reduced motion, moves the open card down the rail with Next step, the steps done ticked", () => {
    const el = render({ reduced: true });
    const steps = () => Array.from(el.querySelectorAll("[data-rail] [data-step]")).map((c) => c.dataset.step);
    const button = (name) => Array.from(el.querySelectorAll("button")).find((b) => b.textContent === name);
    expect(steps()).toEqual(["open", "next", "next", "next", "next"]);
    // The buttons are under the open step's text, and its line does not fill (no scroll)
    expect(button("Next step").closest('[data-step="open"]')).not.toBeNull();
    expect(el.querySelector('[data-step="open"] [data-step-bar]').style.transform).toBe("scaleY(0)");
    act(() => button("Next step").click());
    expect(steps()).toEqual(["done", "open", "next", "next", "next"]);
    expect(el.querySelector('[data-step="done"] svg')).not.toBeNull();
    // A step done has its line full, down to the open one
    expect(el.querySelector('[data-step="done"] [data-step-bar]').style.transform).toBe("scaleY(1)");
    expect(button("Next step").closest('[data-step="open"]').textContent).toContain(COPY.chapters[1].title);
    act(() => button("Previous step").click());
    expect(steps()).toEqual(["open", "next", "next", "next", "next"]);
  });

  it("with reduced motion, shows one still per chapter, stepped by hand, and no track", () => {
    const el = render({ reduced: true });
    expect(el.querySelector("[data-track]")).toBeNull();
    const button = (name) => Array.from(el.querySelectorAll("button")).find((b) => b.textContent === name);
    expect(button("Previous step").disabled).toBe(true);
    const first = el.querySelector("[data-stage]").dataset.tick;
    act(() => button("Next step").click());
    expect(el.querySelector("[data-stage]").dataset.tick).not.toBe(first);
    for (let i = 0; i < 6; i += 1) act(() => button("Next step").click());
    expect(button("Next step").disabled).toBe(true);
    expect(el.querySelector("[data-stage]").dataset.tick).toBe("1000");
  });

  it("has no skip link, and nothing in the section takes focus (Tab passes straight through)", () => {
    const el = render({ reduced: false });
    expect(el.querySelector('a[href^="#"]')).toBeNull();
    expect(el.textContent).not.toContain("Skip the preview");
    expect(el.querySelectorAll("a, button, input, select, [tabindex]")).toHaveLength(0);
  });

  it("plays the laptop preview with a mouse from 1024 px", () => {
    const el = render({ reduced: false });
    expect(el.querySelector("[data-stage]").dataset.touch).toBe("false");
  });
});

describe("HowItWorks on phones and tablets (22 Oct 2026)", () => {
  it("plays the tool's phone layout under 1024 px, on the same track, with the chapter as a band across the top", () => {
    const el = render({ reduced: false, narrow: true });
    const track = el.querySelector("[data-track]");
    expect(track.className).toContain(`h-[${Math.round(TRACK_SCREENS * 100)}svh]`);
    const stage = el.querySelector("[data-stage]");
    expect(stage.dataset.touch).toBe("true");
    expect(stage.closest("[inert]")).not.toBeNull();
    expect(stage.closest('[aria-hidden="true"]')).not.toBeNull();
    const frame = el.querySelector("[data-frame]");
    expect(frame.className).toContain("border-line");
    const band = el.querySelector("[data-caption]");
    // First in the frame, above the screen, so it never covers the answers sheet
    expect(frame.firstElementChild).toBe(band);
    expect(band.className).not.toMatch(/(^|\s)(absolute|bottom-)/);
    expect(band.textContent).toContain(COPY.touchChapters[0].title);
    expect(band.textContent).toContain(COPY.touchChapters[0].text);
    expect(frame.style.transform).toBe("scale(0.88)");
  });

  it("plays it on a touch device at any width, an iPad held sideways too, and says so to the stage", () => {
    const el = render({ reduced: false, coarse: true });
    expect(el.querySelector("[data-stage]").dataset.touch).toBe("true");
    expect(el.querySelector("[data-stage]").dataset.coarse).toBe("true");
  });

  it("keeps the band one height for every chapter, as tall as the longest text and no taller, nothing cut short (28 Oct 2026)", () => {
    const el = render({ reduced: true, narrow: true });
    const button = (name) => Array.from(el.querySelectorAll("button")).find((b) => b.textContent === name);
    for (let i = 0; i < COPY.touchChapters.length; i += 1) {
      // Every text in the same grid cell, so the cell takes the tallest, and only the current one shown
      const texts = Array.from(el.querySelectorAll("[data-band-text] > p"));
      expect(texts.map((p) => p.textContent)).toEqual(COPY.touchChapters.map((c) => c.text));
      texts.forEach((p, k) => {
        expect(p.className).toContain("[grid-area:1/1]");
        expect(p.classList.contains("invisible")).toBe(k !== i);
        expect(p.className).not.toMatch(/line-clamp|truncate|min-h-/);
      });
      if (i < COPY.touchChapters.length - 1) act(() => button("Next step").click());
    }
  });

  it("with reduced motion, shows one still per chapter, stepped by hand, ending on the second photo", () => {
    const el = render({ reduced: true, narrow: true });
    expect(el.querySelector("[data-track]")).toBeNull();
    const button = (name) => Array.from(el.querySelectorAll("button")).find((b) => b.textContent === name);
    expect(el.querySelector("[data-stage]").dataset.touch).toBe("true");
    expect(Number(el.querySelector("[data-stage]").dataset.tick)).toBeCloseTo(TOUCH_STILL_TICKS[0]);
    expect(button("Previous step").disabled).toBe(true);
    for (let i = 1; i < TOUCH_STILL_TICKS.length; i += 1) {
      act(() => button("Next step").click());
      expect(Number(el.querySelector("[data-stage]").dataset.tick)).toBeCloseTo(TOUCH_STILL_TICKS[i]);
      expect(el.querySelector("[data-caption]").textContent).toContain(COPY.touchChapters[i].title);
    }
    expect(button("Next step").disabled).toBe(true);
    expect(el.querySelector("[data-stage]").dataset.tick).toBe("1000");
  });

  it("gives screen readers the phone's words for the chapters, and nothing in the section takes focus", () => {
    const el = render({ reduced: false, narrow: true });
    const list = el.querySelector("ol.sr-only");
    expect(list.textContent).toContain(COPY.touchChapters[2].text);
    expect(list.textContent).not.toContain(COPY.chapters[2].text);
    expect(el.querySelectorAll("a, button, input, select, [tabindex]")).toHaveLength(0);
  });
});
