// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { writeSession, readSessionData } from "@/util/sessionCache";

vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: { user: { username: "rans" } } }) }));
vi.mock("next/router", () => ({ default: { reload: vi.fn() } }));
vi.mock("@/ui/page", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/features/layout/contentSkeleton", () => ({ default: () => <p>loading</p> }));
vi.mock("@/features/annotate/selection", () => ({ default: () => <p>picker</p> }));
vi.mock("@/features/annotate/done", () => ({ default: () => <p>done</p> }));
vi.mock("@/ui/annotation-tool/index", () => ({ SHEET_EVENT: "imprint:answer-sheet" }));
// The layout, set per test
const screen = vi.hoisted(() => ({ layout: "desktop", phone: false }));
vi.mock("@/hooks/useAnnotateLayout", () => ({ useAnnotateLayout: () => screen.layout }));
vi.mock("@/hooks/useIsPhone", () => ({ useIsPhone: () => screen.phone }));
// The tour's props, for its cards
const joyride = vi.hoisted(() => ({ props: null }));
vi.mock("react-joyride", () => ({
  Joyride: (props) => {
    joyride.props = props;
    return null;
  },
}));
// The form's props, and the tour's targets it draws: every one unless a test leaves some out
// `inBody` names targets drawn inside the sheet's scrolling body, as Step 1 is once answered (S15)
const seen = vi.hoisted(() => ({ form: null, without: [], inBody: [] }));
const TARGETS = [
  ["sidewalk-presence-section", "div"],
  ["rp-stage", "div", "class"],
  ["box-review-section", "div"],
  ["box-review-lists", "div"],
  ["box-review-chips-peek", "div"],
  ["add-box-button", "button"],
  ["scene-level-section", "div"],
];
vi.mock("@/features/annotate/form", () => ({
  default: (props) => {
    seen.form = props;
    const draw = (name, tag, kind) => React.createElement(tag, kind === "class" ? { key: name, className: name } : { key: name, id: name });
    const shown = TARGETS.filter(([name]) => !seen.without.includes(name));
    return (
      <div>
        {shown.filter(([name]) => !seen.inBody.includes(name)).map(([name, tag, kind]) => draw(name, tag, kind))}
        <div data-sheet-scroll="">
          {shown.filter(([name]) => seen.inBody.includes(name)).map(([name, tag, kind]) => draw(name, tag, kind))}
        </div>
        {/* eslint-disable-next-line react/forbid-elements -- the tool's submit button, which the tour's last card points at */}
        {!seen.without.includes("submit") && <button type="submit">Next Image</button>}
      </div>
    );
  },
}));

import AnnotatePage, { TOUR_REMINDER_MS, TOUR_REMINDER_SETTLE_MS } from "@/pages/contribute/annotate";
import TourCard from "@/features/tutorial/TourCard";

/**
 * S30 (14 Nov 2026): the tour on every photo of a contributor's real
 * session, from the ? button, and the one-time line on the first photo
 * saying where it is.
 */
const batch = ({ isAnnotator = false, ...extra } = {}) => ({ imgRecords: [{ _id: "a", imageID: 1 }, { _id: "b", imageID: 2 }], isAnnotator, ...extra });
let host;
let root;
let fetchMock;

/** Photo `current` of a cached batch, as after Next Image */
async function open({ data = batch(), current = 1 } = {}) {
  writeSession({ total: data.imgRecords.length, current, data });
  sessionStorage.setItem("isNavigatingImages", "true");
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  globalThis.fetch = fetchMock;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<AnnotatePage />));
  await act(async () => {});
}
function close() {
  act(() => root?.unmount());
  host?.remove();
  root = null;
}
const showTour = () => act(async () => seen.form.onShowTour());
const targets = () => joyride.props.steps.map((s) => s.target);
/** The card's footer, drawn as the tour library would for step `index` */
function cardFooter(index) {
  const step = joyride.props.steps[index];
  const Tooltip = joyride.props.tooltipComponent;
  const el = document.createElement("div");
  const r = createRoot(el);
  act(() => r.render(<Tooltip index={index} step={step} backProps={{ onClick() {} }} primaryProps={{ onClick() {} }} tooltipProps={{}} />));
  const text = el.textContent;
  act(() => r.unmount());
  return text;
}
const hint = () => Array.from(host.querySelectorAll("[role='status']")).find((el) => /find more information/.test(el.textContent));
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, TOUR_REMINDER_SETTLE_MS + 50)));
const seenCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/user/tourHintSeen");

beforeEach(() => {
  window.localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  joyride.props = null;
  seen.form = null;
  seen.without = [];
  seen.inBody = [];
  screen.layout = "desktop";
  screen.phone = false;
});
afterEach(() => {
  vi.useRealTimers();
  close();
});

describe("the tour in a contributor's session (S30)", () => {
  it("has the ? button on a laptop, and opens only from it, with the contributor tour", async () => {
    await open();
    expect(typeof seen.form.onShowTour).toBe("function");
    // Never by itself
    expect(joyride.props).toBeNull();
    await showTour();
    expect(joyride.props?.run).toBe(true);
    expect(joyride.props.steps.map((s) => s.title)).toEqual([
      "Is There a Sidewalk?", "Check Each Box", "What Counts as the Path", "Your Answers", "Severity", "Scene-Level Assessment", "Next Image",
    ]);
    // S28's zoom line on Check Each Box, as in the tutorial
    expect(joyride.props.steps[1].zoomNote).toMatch(/zoom in/);
    expect(cardFooter(0)).toContain("Step 1 of 7");
    // Each step gives the tour library a promise, as in the tutorial
    for (const step of joyride.props.steps) await step.before();
  });

  it("has it on a phone too, with the touch tour, and closes an open box first", async () => {
    screen.layout = "sheet";
    screen.phone = true;
    await open();
    const sheet = vi.fn();
    window.addEventListener("imprint:answer-sheet", sheet);
    await showTour();
    window.removeEventListener("imprint:answer-sheet", sheet);
    expect(sheet.mock.calls[0][0].detail).toBe("collapsed");
    expect(joyride.props.steps).toHaveLength(8);
    expect(targets()).toContain("#add-box-button");
    expect(cardFooter(7)).toContain("Step 8 of 8");
    expect(cardFooter(7)).toContain("Finish");
  });

  // 14 Nov 2026, found by Rans on a phone: with Step 1 answered, its section
  // is in the part of the sheet pulled down, and the first card pointed below the sheet
  it("pulls the sheet up for a card whose target is in the sheet's body, and puts it back after", async () => {
    screen.layout = "sheet";
    seen.inBody = ["sidewalk-presence-section"];
    await open();
    await showTour();
    const sheet = vi.fn();
    window.addEventListener("imprint:answer-sheet", sheet);
    const [first, second] = joyride.props.steps;
    expect(first.target).toBe("#sidewalk-presence-section");
    await first.before();
    expect(sheet.mock.calls.map(([e]) => e.detail)).toEqual([{ snap: "full", scrollTo: "#sidewalk-presence-section" }]);
    first.after();
    expect(sheet.mock.calls.at(-1)[0].detail).toBe("collapsed");
    // The next card, on the photo, leaves the sheet down
    sheet.mockClear();
    await second.before();
    second.after?.();
    expect(sheet).not.toHaveBeenCalled();
    window.removeEventListener("imprint:answer-sheet", sheet);
  });

  it("leaves the sheet down for Step 1 at its top, before it is answered, and on a laptop", async () => {
    for (const layout of ["sheet", "desktop"]) {
      screen.layout = layout;
      seen.inBody = layout === "desktop" ? ["sidewalk-presence-section"] : [];
      await open();
      await showTour();
      const sheet = vi.fn();
      window.addEventListener("imprint:answer-sheet", sheet);
      const first = joyride.props.steps[0];
      await first.before();
      first.after?.();
      window.removeEventListener("imprint:answer-sheet", sheet);
      expect(sheet, layout).not.toHaveBeenCalled();
      close();
    }
  });

  it("is on every photo of the session", async () => {
    await open({ current: 2 });
    expect(seen.form.current).toBe(2);
    await showTour();
    expect(joyride.props?.run).toBe(true);
  });

  it("leaves out a card whose target is not on the screen, and counts only the cards shown", async () => {
    seen.without = ["scene-level-section"];
    await open();
    await showTour();
    expect(joyride.props.steps).toHaveLength(6);
    expect(targets()).not.toContain("#scene-level-section");
    expect(joyride.props.steps.map((s) => s.title)).not.toContain("Scene-Level Assessment");
    expect(cardFooter(0)).toContain("Step 1 of 6");
    expect(cardFooter(5)).toContain("Step 6 of 6");
    expect(cardFooter(5)).toContain("Finish");
  });

  it("leaves out a target that is on the page but not drawn", async () => {
    await open();
    const section = document.getElementById("box-review-section");
    section.checkVisibility = () => false;
    await showTour();
    expect(targets()).not.toContain("#box-review-section");
    expect(joyride.props.steps).toHaveLength(6);
  });

  it("closes rather than pointing at nothing when no target is on the screen", async () => {
    seen.without = TARGETS.map(([name]) => name).concat("submit");
    await open();
    await showTour();
    expect(joyride.props).toBeNull();
    // And opens again once the photo is there
    seen.without = [];
    await act(async () => root.render(<AnnotatePage />));
    await showTour();
    expect(joyride.props?.run).toBe(true);
  });

  it("closes from its × and the tour library's finish, and opens again from the button", async () => {
    await open();
    await showTour();
    await act(async () => joyride.props.callback({ status: "finished" }));
    joyride.props = null;
    await act(async () => {});
    expect(joyride.props).toBeNull();
    await showTour();
    expect(joyride.props?.run).toBe(true);
  });

  it("is not there for annotators", async () => {
    await open({ data: batch({ isAnnotator: true }) });
    expect(seen.form.onShowTour).toBeUndefined();
    expect(seen.form.tourTelemetry).toBeUndefined();
    expect(joyride.props).toBeNull();
  });
});

describe("the tour's telemetry (S30)", () => {
  it("is 0 and 0 on a photo where the tour was never opened", async () => {
    await open();
    expect(seen.form.tourTelemetry()).toEqual({ tourOpens: 0, msTourOpen: 0 });
  });

  it("counts each opening and the time open in all, a tour still open included", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    await open();
    await showTour();
    now += 4000;
    await act(async () => joyride.props.callback({ status: "finished" }));
    expect(seen.form.tourTelemetry()).toEqual({ tourOpens: 1, msTourOpen: 4000 });
    now += 10000;
    await showTour();
    now += 2500;
    // Still open as the photo is sent
    expect(seen.form.tourTelemetry()).toEqual({ tourOpens: 2, msTourOpen: 6500 });
    vi.restoreAllMocks();
  });
});

describe("the one-time line saying where the tour is (S30)", () => {
  it("shows on the first photo when the batch says showTourHint, and the account is told once", async () => {
    await open({ data: batch({ showTourHint: true }) });
    expect(hint()).toBeUndefined();
    await settle();
    expect(hint()?.textContent).toBe("You can find more information by clicking the Tour button at the top of the page.");
    expect(seenCalls()).toEqual([["/api/user/tourHintSeen", { method: "POST" }]]);
    // The cached batch is told, for the next photo
    expect(readSessionData().showTourHint).toBe(false);
  });

  it("goes after 8 seconds, as the practice's reminder did", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await open({ data: batch({ showTourHint: true }) });
    await act(async () => vi.advanceTimersByTime(TOUR_REMINDER_SETTLE_MS));
    expect(hint()).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(TOUR_REMINDER_MS - 100));
    expect(hint()).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(200));
    expect(hint()).toBeUndefined();
  });

  it("says tap and ? on a phone", async () => {
    screen.layout = "sheet";
    await open({ data: batch({ showTourHint: true }) });
    await settle();
    expect(hint()?.textContent).toBe("You can find more information by tapping the ? button at the top of the screen.");
  });

  it("does not show on the next photo, from the cached batch, nor again in a later load", async () => {
    await open({ data: batch({ showTourHint: true }) });
    await settle();
    expect(hint()).toBeTruthy();
    const cached = readSessionData();
    close();
    // Next Image: the page loads again on photo 2, from the cache
    await open({ data: cached, current: 2 });
    await settle();
    expect(hint()).toBeUndefined();
    expect(seenCalls()).toHaveLength(0);
  });

  it("does not show when the batch says false or nothing, nor for annotators", async () => {
    for (const data of [batch({ showTourHint: false }), batch(), batch({ isAnnotator: true, showTourHint: true })]) {
      await open({ data });
      await settle();
      expect(hint()).toBeUndefined();
      expect(seenCalls()).toHaveLength(0);
      close();
    }
  });

  it("waits while the photo is full screen, and shows once it is left", async () => {
    await open({ data: batch({ showTourHint: true }) });
    await act(async () => seen.form.onFocusChange(true));
    await settle();
    expect(hint()).toBeUndefined();
    expect(seenCalls()).toHaveLength(0);
    await act(async () => seen.form.onFocusChange(false));
    await settle();
    expect(hint()).toBeTruthy();
    expect(seenCalls()).toHaveLength(1);
  });

  it("hides when the tour opens, or when the laptop's message shows", async () => {
    await open({ data: batch({ showTourHint: true }) });
    await settle();
    await showTour();
    expect(hint()).toBeUndefined();
    close();
    await open({ data: batch({ showTourHint: true }) });
    await settle();
    await act(async () => seen.form.onDesktopMessage(true));
    expect(hint()).toBeUndefined();
  });
});

// The card itself is the tutorial's (TourCard), so the session's look the same
describe("the session tour's card", () => {
  it("is the tutorial's TourCard", async () => {
    await open();
    await showTour();
    const Tooltip = joyride.props.tooltipComponent;
    const element = Tooltip({ index: 0, step: joyride.props.steps[0], backProps: {}, primaryProps: {}, tooltipProps: {} });
    expect(element.type).toBe(TourCard);
  });
});
