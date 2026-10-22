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

import HowItWorks, { LEAD_IN, TOUCH_STILL_TICKS, TRACK_SCREENS } from "./HowItWorks";
import { ENTRANCE_END, TICKS } from "./howItWorks/demoScript";
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
    // In the page's margins (the Container the hero uses), framed like the map
    const frame = stage.closest(".rounded-card");
    expect(frame.className).toContain("border-line");
    expect(frame.closest(".max-w-7xl")).not.toBeNull();
  });

  it("starts half a screen early, the frame growing in as it arrives, in step with the script", () => {
    // The script's ENTRANCE_END is the tick the frame pins at
    expect(ENTRANCE_END).toBe(Math.round((TICKS * LEAD_IN) / (TRACK_SCREENS - 1 + LEAD_IN)));
    // Before it has arrived (jsdom has no layout: progress 0), the frame is drawn smaller
    const el = render({ reduced: false });
    expect(el.querySelector("[data-frame]").style.transform).toBe("scale(0.88)");
  });

  it("keeps the step card in the bottom-left corner for every chapter", () => {
    const el = render({ reduced: true });
    const card = () => el.querySelector("[data-caption]");
    const placed = card().className;
    expect(placed).toContain("sm:left-6");
    expect(placed).toContain("sm:bottom-[30px]");
    expect(placed).not.toMatch(/(^|\s)(sm:)?top-/);
    const button = Array.from(el.querySelectorAll("button")).find((b) => b.textContent === "Next step");
    for (let i = 0; i < 4; i += 1) {
      act(() => button.click());
      expect(card().className).toBe(placed);
      expect(card().style.transform).toBe("");
    }
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

  it("keeps the band one height for every chapter: two lines of text, clamped", () => {
    const el = render({ reduced: true, narrow: true });
    const text = Array.from(el.querySelectorAll("[data-caption] p")).at(-1);
    expect(text.textContent).toBe(COPY.touchChapters[0].text);
    expect(text.className).toContain("min-h-[2.5rem]");
    expect(text.className).toContain("line-clamp-2");
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
