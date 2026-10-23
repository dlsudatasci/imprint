// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// The drawings are covered by DemoStage.test.jsx and TouchStage.test.jsx.
// Here they are a stand-in that says which one, and which still, it was given.
vi.mock("next/dynamic", () => ({
  default: () => (props) => <div data-stage={props.frame.snap !== undefined ? "touch" : "desktop"} data-tick={props.frame.tick} data-coarse={String(Boolean(props.coarse))} />,
}));

import GuideStill from "./GuideStill";
import SessionPickerStill, { PICKER_PHONE_QUERY } from "./SessionPickerStill";
import { STILL_TICKS, TOUCH_STILL_TICKS } from "@/features/home/HowItWorks";
import { SHEET_LAYOUT_QUERY, TOUCH_DEVICE_QUERY } from "@/hooks/useAnnotateLayout";
import { GUIDE_COPY } from "./guideCopy";

/**
 * The annotation guide's pictures on phones and tablets (23 Oct 2026,
 * IMPRINT_guide_touch_stills.md): the screen the tool shows there, not the
 * laptop page shrunk to the column.
 */
let root = null;
let host = null;
const realMatchMedia = window.matchMedia;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  window.matchMedia = realMatchMedia;
});

function render(element, { narrow = false, coarse = false, phone = false } = {}) {
  const answers = { [SHEET_LAYOUT_QUERY]: narrow, [TOUCH_DEVICE_QUERY]: coarse, [PICKER_PHONE_QUERY]: phone };
  window.matchMedia = (query) => ({ matches: answers[query] ?? false, media: query, addEventListener: () => {}, removeEventListener: () => {} });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(element));
  return host;
}

describe("GuideStill", () => {
  it("draws the laptop preview's still with a mouse from 1024 px, in its 16 by 10 frame", () => {
    const el = render(<GuideStill index={2} />);
    const stage = el.querySelector("[data-stage]");
    expect(stage.dataset.stage).toBe("desktop");
    expect(Number(stage.dataset.tick)).toBeCloseTo(STILL_TICKS[2]);
    expect(el.querySelector('[data-guide-still="desktop"]').className).toContain("aspect-[16/10]");
  });

  it("draws the phone and tablet preview's still wherever the tool uses its phone layout, in a screen-shaped frame", () => {
    for (const media of [{ narrow: true }, { coarse: true }]) {
      const el = render(<GuideStill index={3} />, media);
      const stage = el.querySelector("[data-stage]");
      expect(stage.dataset.stage).toBe("touch");
      expect(Number(stage.dataset.tick)).toBeCloseTo(TOUCH_STILL_TICKS[3]);
      expect(stage.dataset.coarse).toBe(String(Boolean(media.coarse)));
      const frame = el.querySelector('[data-guide-still="touch"]');
      expect(frame.className).toContain("aspect-[9/16]");
      expect(frame.className).toContain("sm:aspect-[3/4]");
      // Inert and hidden from screen readers: the guide's text says what it shows
      expect(stage.closest("[inert]")).not.toBeNull();
      expect(stage.closest('[aria-hidden="true"]')).not.toBeNull();
      act(() => root.unmount());
      host.remove();
      root = null;
    }
  });

  it("has a phone still for every picture the guide shows", () => {
    for (const step of GUIDE_COPY.steps) {
      if (step.still !== undefined) expect(TOUCH_STILL_TICKS[step.still], step.id).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("SessionPickerStill", () => {
  const buttons = (el) => el.querySelector('[data-guide-still="session-picker"] .flex.gap-4');

  it("shows the laptop and tablet picker from 640 px: Cancel beside Start", () => {
    const el = render(<SessionPickerStill />);
    const frame = el.querySelector('[data-guide-still="session-picker"]');
    expect(frame.hasAttribute("data-phone")).toBe(false);
    expect(frame.className).toContain("aspect-[16/10]");
    expect(buttons(el).className).not.toContain("flex-col");
  });

  it("shows the phone picker under 640 px, as selection.jsx lays it out there: Cancel above Start, both full width, in an upright frame", () => {
    const el = render(<SessionPickerStill />, { phone: true });
    const frame = el.querySelector('[data-guide-still="session-picker"]');
    expect(frame.hasAttribute("data-phone")).toBe(true);
    expect(frame.className).toContain("aspect-[9/20]");
    expect(buttons(el).className).toContain("flex-col");
    const [cancel, start] = buttons(el).querySelectorAll("button");
    expect(cancel.textContent).toBe("Cancel");
    expect(start.textContent).toBe("Start Session");
    expect(frame.querySelector("h2").className).toContain("text-2xl");
  });
});
