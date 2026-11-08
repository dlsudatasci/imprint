// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ProgressStrip from "./ProgressStrip";
import { GO_TO_IMAGE_EVENT } from "@/util/imageNavigation";

/**
 * The furthest image reached (6 Nov 2026, the tutorial and every session):
 * after going back, the images up to it stay done and can be opened from the
 * strip, forward as well as back. A click asks the annotation tool for the
 * image, which sends a changed image first (ReactPictureAnnotation.navigation.test.tsx).
 */
const images = [1, 2, 3].map((n) => ({ url: `/images/tutorial/tutorial-${n}.jpg` }));
const CHECK = "M5 13l4 4L19 7";
let host;
let root;
const reload = vi.fn();

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = () => {};
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
});

beforeEach(() => {
  window.localStorage.clear();
  sessionStorage.clear();
  reload.mockClear();
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

function mount(props) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<ProgressStrip images={images} onStop={() => {}} isTutorial {...props} />));
  return [...host.querySelectorAll("[data-index]")];
}

const state = (button) => ({
  enabled: !button.disabled,
  done: button.innerHTML.includes(CHECK),
  number: button.textContent.trim(),
});

describe("the progress strip with the furthest image reached", () => {
  it("keeps the images up to it done and clickable after going back to the first", () => {
    const [first, second, third] = mount({ current: 1, reached: 3 });
    expect(state(first)).toEqual({ enabled: false, done: false, number: "1" });
    expect(state(second)).toEqual({ enabled: true, done: true, number: "" });
    // Reached but not done: its number, and it can be opened
    expect(state(third)).toEqual({ enabled: true, done: false, number: "3" });
    expect(third.className).toContain("cursor-pointer");
  });

  it("is as before without it: only the images before the one on screen", () => {
    const buttons = mount({ current: 2 }).map(state);
    expect(buttons).toEqual([
      { enabled: true, done: true, number: "" },
      { enabled: false, done: false, number: "2" },
      { enabled: false, done: false, number: "3" },
    ]);
  });

  it("is as before when it is the image on screen", () => {
    expect(mount({ current: 3, reached: 3 }).map((b) => state(b).enabled)).toEqual([true, true, false]);
  });

  const asked = () => {
    const heard = [];
    const listener = (event) => heard.push(event.detail);
    window.addEventListener(GO_TO_IMAGE_EVENT, listener);
    return { heard, stop: () => window.removeEventListener(GO_TO_IMAGE_EVENT, listener) };
  };

  it("asks the tool for an image reached, forward or back", async () => {
    const [first, , third] = mount({ current: 2, reached: 3 });
    const { heard, stop } = asked();
    await act(async () => third.click());
    await act(async () => first.click());
    stop();
    expect(heard).toEqual([3, 1]);
    // The tool moves, not the strip
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("never asks past the furthest image or for the one on screen", async () => {
    const [first, , third] = mount({ current: 1, reached: 2 });
    expect(third.disabled).toBe(true);
    const { heard, stop } = asked();
    await act(async () => third.click());
    await act(async () => first.click());
    stop();
    expect(heard).toEqual([]);
  });

  it("works the same in a session as in the tutorial", () => {
    act(() => root?.unmount());
    host?.remove();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<ProgressStrip images={images} current={1} reached={3} onStop={() => {}} onPause={() => {}} />));
    expect([...host.querySelectorAll("[data-index]")].map((b) => !b.disabled)).toEqual([false, true, true]);
  });
});

// S19 (8 Nov 2026): on the tutorial's first image the button does the practice again
describe("the tutorial's button by Stop Tutorial", () => {
  const tourButton = () => [...host.querySelectorAll("button")].find((b) => /Tour|Practice/.test(b.textContent));

  it("reads Tour, or the label it is given", () => {
    mount({ current: 2, onShowTour: () => {} });
    expect(tourButton().textContent.trim()).toBe("Tour");
    expect(tourButton().title).toBe("Show the tour");
    act(() => root.unmount());
    host.remove();
    const onShowTour = vi.fn();
    mount({ current: 1, onShowTour, tourButton: { label: "Practice", title: "Redo the practice" } });
    expect(tourButton().textContent.trim()).toBe("Practice");
    expect(tourButton().title).toBe("Redo the practice");
    act(() => tourButton().click());
    expect(onShowTour).toHaveBeenCalledTimes(1);
  });
});
