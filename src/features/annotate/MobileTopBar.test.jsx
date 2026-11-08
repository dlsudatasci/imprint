// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import MobileTopBar from "./MobileTopBar";

/** S19 (8 Nov 2026): the top bar's ? does the practice again on the tutorial's first image, and is named so */
beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
let host;
let root;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
function mount(props) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<MobileTopBar current={1} total={3} onPause={() => {}} onStop={() => {}} isTutorial {...props} />));
}

describe("the top bar's ?", () => {
  it("is named for the tour, or for what it is given", () => {
    mount({ onShowTour: () => {} });
    expect(host.querySelector("[aria-label='Show the tour']")).toBeTruthy();
    act(() => root.unmount());
    host.remove();
    const onShowTour = vi.fn();
    mount({ onShowTour, tourButton: { label: "Practice", title: "Redo the practice" } });
    const button = host.querySelector("[aria-label='Redo the practice']");
    expect(button.title).toBe("Redo the practice");
    act(() => button.click());
    expect(onShowTour).toHaveBeenCalledTimes(1);
  });

  it("is not there without onShowTour", () => {
    mount({});
    expect(host.querySelector("[aria-label='Show the tour']")).toBeNull();
  });
});
