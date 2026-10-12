// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { writeSession } from "@/util/sessionCache";
import { SiteChromeContext } from "@/features/layout/siteChrome";

// The tool itself is not under test here: it shows what the form passes it,
// and has two buttons standing in for its full-screen controls
vi.mock("@/ui/annotation-tool/index", () => ({
  ReactPictureAnnotation: (props) => (
    <div data-tool data-layout={props.layout} data-focus={String(props.focus === true)} data-can-focus={String(typeof props.onEnterFocus === "function")}>
      {/* eslint-disable-next-line react/forbid-elements -- a stand-in for the tool's own buttons */}
      <button data-enter onClick={() => props.onEnterFocus?.()}>enter</button>
      {/* eslint-disable-next-line react/forbid-elements -- a stand-in for the tool's own buttons */}
      <button data-exit onClick={() => props.onExitFocus?.()}>exit</button>
    </div>
  ),
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { username: "test" } }, status: "authenticated" }) }));

import AnnotateForm, { KEEP_FOCUS_KEY } from "./index";

/**
 * The phone screen (12 Oct 2026): the site's navbar and footer are hidden, the
 * photo can go full screen on phones and tablets (never with a mouse), a phone
 * held sideways gets a way into full screen, and the tutorial's top bar has a
 * tour button.
 */
let root;
let host;
const realMatchMedia = window.matchMedia;
const realScreen = window.screen;
const realRequestFullscreen = document.documentElement.requestFullscreen;

const SHEET = "(max-width: 1023.98px)";
const COARSE = "(pointer: coarse)";
const SIDEWAYS = "(orientation: landscape) and (max-height: 500px)";

function device({ width, height, coarse = true, sideways = false, orientation } = {}) {
  window.matchMedia = (query) => ({
    matches: query === SHEET ? width < 1024 : query === COARSE ? coarse : query === SIDEWAYS ? sideways : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  Object.defineProperty(window, "screen", { configurable: true, value: { width, height, orientation } });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function mount(props = {}, chrome) {
  host = document.createElement("main");
  document.body.appendChild(host);
  root = createRoot(host);
  const form = <AnnotateForm data={{ imageID: "A", url: "/p.jpg", annotationList: [] }} current={1} total={3} allImages={[{ imageID: "A" }]} {...props} />;
  act(() => {
    root.render(chrome ? <SiteChromeContext.Provider value={chrome}>{form}</SiteChromeContext.Provider> : form);
  });
}

const tool = () => document.querySelector("[data-tool]");
const press = async (selector) => {
  await act(async () => {
    document.querySelector(selector).click();
  });
};
const topBar = () => document.querySelector("header");

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  writeSession({ total: 3, current: 1, data: { imgRecords: [{ imageID: "A" }], isAnnotator: false } });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  window.matchMedia = realMatchMedia;
  Object.defineProperty(window, "screen", { configurable: true, value: realScreen });
  document.documentElement.requestFullscreen = realRequestFullscreen;
  delete document.fullscreenElement;
});

describe("the phone screen and the site chrome", () => {
  it("hides the navbar and footer in the sheet layout, for both roles, and not on the desktop layout", () => {
    for (const isAnnotator of [false, true]) {
      const chrome = { hidden: false, setHidden: vi.fn() };
      device({ width: 390, height: 844 });
      mount({ isAnnotator }, chrome);
      expect(tool().dataset.layout).toBe("sheet");
      expect(chrome.setHidden).toHaveBeenLastCalledWith(true);
      act(() => root.unmount());
      expect(chrome.setHidden).toHaveBeenLastCalledWith(false);
      host.remove();
    }
    const chrome = { hidden: false, setHidden: vi.fn() };
    device({ width: 1440, height: 900, coarse: false });
    mount({}, chrome);
    expect(tool().dataset.layout).toBe("desktop");
    expect(chrome.setHidden).not.toHaveBeenCalledWith(true);
  });
});

describe("the full-screen photo", () => {
  // Tablets from later on 12 Oct 2026, which have the sheet layout either way
  // up. Never with a mouse: the desktop tool is as it was.
  it("is offered on a phone and on a tablet either way up, all in the sheet layout, and not with a mouse", () => {
    for (const [width, height] of [[390, 844], [820, 1180], [1180, 820], [1366, 1024]]) {
      const chrome = { hidden: false, setHidden: vi.fn() };
      device({ width, height });
      mount({}, chrome);
      expect(tool().dataset.layout).toBe("sheet");
      expect(tool().dataset.canFocus).toBe("true");
      expect(chrome.setHidden).toHaveBeenLastCalledWith(true);
      expect(topBar()).not.toBeNull();
      act(() => root.unmount());
      host.remove();
    }
    for (const [width, height, layout] of [[1440, 900, "desktop"], [800, 900, "sheet"]]) {
      device({ width, height, coarse: false });
      mount();
      expect(tool().dataset.layout).toBe(layout);
      expect(tool().dataset.canFocus).toBe("false");
      act(() => root.unmount());
      host.remove();
    }
  });

  it("on a tablet asks for the browser's full screen and never turns it", async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    device({ width: 1180, height: 820, orientation: { lock, unlock: vi.fn() } });
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    mount();
    const mounted = tool();
    await press("[data-enter]");
    expect(tool()).toBe(mounted);
    expect(tool().dataset.focus).toBe("true");
    expect(topBar()).toBeNull();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
    expect(lock).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Turn your phone sideways");
    await press("[data-exit]");
    expect(tool().dataset.focus).toBe("false");
    expect(topBar()).not.toBeNull();
  });

  // Next Image and Previous reload the page, which dropped full screen on every image
  it("is kept from one image to the next, and not after a longer absence or once left", async () => {
    device({ width: 390, height: 844 });
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    mount();
    // Left outside full screen: nothing kept
    window.dispatchEvent(new Event("pagehide"));
    expect(window.sessionStorage.getItem(KEEP_FOCUS_KEY)).toBeNull();
    await press("[data-enter]");
    window.dispatchEvent(new Event("pagehide"));
    expect(Number(window.sessionStorage.getItem(KEEP_FOCUS_KEY))).toBeGreaterThan(0);
    act(() => root.unmount());
    host.remove();

    // The next image's page: in full screen from the start, and the note is used up
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    mount();
    expect(tool().dataset.focus).toBe("true");
    expect(topBar()).toBeNull();
    expect(window.sessionStorage.getItem(KEEP_FOCUS_KEY)).toBeNull();
    // The browser only gives its own full screen on a tap: asked on the first one, once
    expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(new Event("pointerup"));
    });
    await act(async () => {
      window.dispatchEvent(new Event("pointerup"));
    });
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    host.remove();

    // A page opened long after is not in full screen
    window.sessionStorage.setItem(KEEP_FOCUS_KEY, String(Date.now() - 60000));
    mount();
    expect(tool().dataset.focus).toBe("false");
    expect(window.sessionStorage.getItem(KEEP_FOCUS_KEY)).toBeNull();
  });

  it("hides the top bar and tells the tool on entering, and brings the bar back on leaving", async () => {
    device({ width: 390, height: 844 });
    mount();
    expect(topBar()).not.toBeNull();
    expect(tool().dataset.focus).toBe("false");
    await press("[data-enter]");
    expect(tool().dataset.focus).toBe("true");
    expect(topBar()).toBeNull();
    await press("[data-exit]");
    expect(tool().dataset.focus).toBe("false");
    expect(topBar()).not.toBeNull();
  });

  it("asks the browser for full screen and a sideways lock when it has them, and unlocks on leaving", async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    const unlock = vi.fn();
    device({ width: 390, height: 844, orientation: { lock, unlock } });
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    mount();
    await press("[data-enter]");
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
    expect(lock).toHaveBeenCalledWith("landscape");
    // Locked sideways: no need to say so
    expect(document.body.textContent).not.toContain("Turn your phone sideways");
    await press("[data-exit]");
    expect(unlock).toHaveBeenCalled();
  });

  it("carries on when the browser refuses both, and says sideways gives a bigger photo", async () => {
    device({ width: 390, height: 844, orientation: { lock: vi.fn().mockRejectedValue(new Error("needs full screen")), unlock: vi.fn() } });
    document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error("not on iPhone"));
    mount();
    await press("[data-enter]");
    expect(tool().dataset.focus).toBe("true");
    expect(document.body.textContent).toContain("Turn your phone sideways for a bigger photo.");
  });

  // 12 Oct 2026: the tutorial holds its tour while the photo is full screen
  it("tells the page when full screen starts and ends, once each, and never on the way in", async () => {
    device({ width: 390, height: 844 });
    const onFocusChange = vi.fn();
    mount({ onFocusChange });
    expect(onFocusChange).not.toHaveBeenCalled();
    await press("[data-enter]");
    expect(onFocusChange.mock.calls).toEqual([[true]]);
    await press("[data-exit]");
    expect(onFocusChange.mock.calls).toEqual([[true], [false]]);
  });

  it("leaves when the browser leaves its own full screen, as the back gesture does", async () => {
    device({ width: 390, height: 844 });
    mount();
    await press("[data-enter]");
    expect(tool().dataset.focus).toBe("true");
    // Entering fires the event with an element: still in full screen
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.documentElement });
    act(() => document.dispatchEvent(new Event("fullscreenchange")));
    expect(tool().dataset.focus).toBe("true");
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    act(() => document.dispatchEvent(new Event("fullscreenchange")));
    expect(tool().dataset.focus).toBe("false");
  });
});

describe("a phone held sideways", () => {
  it("shows the notice with a way into full screen, and no notice once in it", async () => {
    device({ width: 844, height: 390, sideways: true });
    mount();
    expect(document.body.textContent).toContain("Turn your phone upright, or annotate sideways in full screen.");
    const enter = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Annotate in full screen");
    expect(enter).toBeDefined();
    // The tool stays mounted under the notice
    expect(tool()).not.toBeNull();
    await act(async () => {
      enter.click();
    });
    expect(tool().dataset.focus).toBe("true");
    expect(document.body.textContent).not.toContain("Turn your phone upright");
  });
});

describe("the tutorial's tour button", () => {
  it("shows in the top bar when the page asks, and calls back", async () => {
    device({ width: 390, height: 844 });
    const onShowTour = vi.fn();
    mount({ isTutorial: true, onShowTour });
    await press('button[aria-label="Show the tour"]');
    expect(onShowTour).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    host.remove();
    mount({ isTutorial: true });
    expect(document.querySelector('button[aria-label="Show the tour"]')).toBeNull();
  });
});
