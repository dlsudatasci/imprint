// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// The drawing is covered by DemoStage.test.jsx. Here it is a stand-in, so
// these tests are about the section: which preview shows, and its controls.
vi.mock("next/dynamic", () => ({ default: () => (props) => <div data-stage data-tick={props.frame.tick} /> }));

import HowItWorks, { LEAD_IN, TRACK_SCREENS } from "./HowItWorks";
import { ENTRANCE_END, TICKS } from "./howItWorks/demoScript";

let root = null;
let host = null;
const realMatchMedia = window.matchMedia;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  window.matchMedia = realMatchMedia;
});

function render({ reduced }) {
  window.matchMedia = (query) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? reduced : false,
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
});
