// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import NasaTlx, { NASA_TLX_COPY, NASA_TLX_SYNC_MS } from "./NasaTlx";
import { NASA_TLX_SCALES, validateNasaTlxPayload } from "@/util/validators/nasaTlx";

/**
 * NASA-TLX after pilot participant 3 (S17, 4 Nov 2026), in jsdom: a tap on a
 * scale where its thumb sits answers it, so the middle can be chosen; Submit
 * says Saving… while the save is under way; a failed save keeps the answers;
 * and a click on the backdrop no longer throws them away.
 */
const SESSION_ID = "0123456789abcdef01234567";

let root = null;
let host;
let onComplete;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  onComplete = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<NasaTlx open sessionNumber={1} sessionId={SESSION_ID} onComplete={onComplete} />));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete globalThis.fetch;
});

/** Mounts the form again, so it starts its position checks under fake timers */
function remountWithFakeTimers() {
  act(() => root.unmount());
  vi.useFakeTimers();
  root = createRoot(host);
  act(() => root.render(<NasaTlx open sessionNumber={1} sessionId={SESSION_ID} onComplete={onComplete} />));
}

const scale = (label) => document.querySelector(`input[type="range"][aria-label="${label}"]`);
// The number under the scale, between its two end labels
const shown = (label) => scale(label).nextElementSibling.children[1].textContent;
const button = (text) => Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === text);
const submit = () => button("Submit") ?? button(NASA_TLX_COPY.saving);
const tap = (input) => act(() => {
  input.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
const tapAll = () => NASA_TLX_SCALES.forEach((s) => tap(scale(s.label)));
const moveTo = (input, v) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, String(v));
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const sentBody = (fetchMock) => JSON.parse(fetchMock.mock.calls[0][1].body);

/** A fetch whose answer waits until `settle` is called */
function pendingFetch() {
  let settle;
  const fetchMock = vi.fn(() => new Promise((resolve) => { settle = resolve; }));
  globalThis.fetch = fetchMock;
  return { fetchMock, settle: (res) => settle(res) };
}

describe("NasaTlx (S17)", () => {
  it("says how to keep the middle, with no em dash or semicolon", () => {
    expect(NASA_TLX_COPY.hint).toBe("Tap or drag each scale, even to keep the middle.");
    expect(document.body.textContent).toContain(NASA_TLX_COPY.hint);
    for (const text of Object.values(NASA_TLX_COPY)) expect(text).not.toMatch(/[—;]/);
  });

  it("counts a pointer down on a scale without moving it as an answer, at 10", () => {
    const mental = scale("Mental Demand");
    expect(mental.value).toBe("10");
    expect(shown("Mental Demand")).toBe("—");
    act(() => mental.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(shown("Mental Demand")).toBe("10");
    // The others are still unanswered
    expect(shown("Effort")).toBe("—");
  });

  it("counts a key that moves a scale, at the value it then shows, and a drag at its value", () => {
    const physical = scale("Physical Demand");
    act(() => physical.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(shown("Physical Demand")).toBe("10");
    moveTo(physical, 11);
    expect(shown("Physical Demand")).toBe("11");
    moveTo(scale("Effort"), 17);
    expect(shown("Effort")).toBe("17");
  });

  it("does not count tabbing past or focus alone", () => {
    const temporal = scale("Temporal Demand");
    act(() => {
      temporal.focus();
      temporal.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      temporal.dispatchEvent(new FocusEvent("focus"));
    });
    expect(shown("Temporal Demand")).toBe("—");
  });

  it("enables Submit only once all six are touched, with no scale filled in for the participant", () => {
    expect(submit().disabled).toBe(true);
    NASA_TLX_SCALES.slice(0, 5).forEach((s) => tap(scale(s.label)));
    expect(submit().disabled).toBe(true);
    tap(scale(NASA_TLX_SCALES[5].label));
    expect(submit().disabled).toBe(false);
  });

  it("submits every scale left at the middle by tapping it, the same payload as before", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    globalThis.fetch = fetchMock;
    tapAll();
    await act(async () => submit().click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/nasa-tlx");
    const body = sentBody(fetchMock);
    expect(body).toEqual({
      sessionId: SESSION_ID,
      sessionNumber: 1,
      dismissed: false,
      responses: Object.fromEntries(NASA_TLX_SCALES.map((s) => [s.key, 10])),
    });
    expect(validateNasaTlxPayload(body).valid).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("reads Saving… with both buttons disabled while the save is under way", async () => {
    const { settle } = pendingFetch();
    tapAll();
    await act(async () => submit().click());
    expect(submit().textContent).toBe(NASA_TLX_COPY.saving);
    expect(submit().disabled).toBe(true);
    expect(button("Skip").disabled).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
    // Escape is ignored meanwhile
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    await act(async () => settle({ ok: true, status: 200 }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog and the answers on a failed save, says so, and lets Submit try again", async () => {
    for (const failure of [async () => ({ ok: false, status: 500 }), async () => { throw new Error("offline"); }]) {
      globalThis.fetch = vi.fn(failure);
      if (submit().disabled) tapAll();
      moveTo(scale("Effort"), 15);
      await act(async () => submit().click());
      expect(onComplete).not.toHaveBeenCalled();
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect(document.querySelector('[role="alert"]').textContent).toBe(NASA_TLX_COPY.failed);
      expect(submit().textContent).toBe("Submit");
      expect(submit().disabled).toBe(false);
      expect(shown("Effort")).toBe("15");
    }
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    globalThis.fetch = fetchMock;
    await act(async () => submit().click());
    expect(sentBody(fetchMock).responses.effort).toBe(15);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does not dismiss on a click on the backdrop, but Skip and Escape do", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    globalThis.fetch = fetchMock;
    const backdrop = document.querySelector("[data-nasa-tlx-backdrop]");
    await act(async () => backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => button("Skip").click());
    expect(sentBody(fetchMock)).toMatchObject({ dismissed: true, responses: null });
    expect(onComplete).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(sentBody(fetchMock)).toMatchObject({ dismissed: true, responses: null });
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it("closes on Skip even when recording the dismissal fails, as before", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
    await act(async () => button("Skip").click());
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

/**
 * Moves that never counted in DuckDuckGo and Brave on phones (23 Nov 2026):
 * Submit stayed off until a scale was dragged again.
 */
describe("NasaTlx, moves the page does not hear about (23 Nov 2026)", () => {
  // A script that stops a scale's events on their way up, so React's shared
  // listener never receives them
  function stopBeforeReact(input) {
    const stop = (e) => e.stopPropagation();
    for (const type of ["pointerdown", "mousedown", "touchstart", "click", "input", "change", "keydown"]) {
      input.parentElement.addEventListener(type, stop);
    }
  }

  it("counts a touch, a drag and a scale key that React never receives", () => {
    const effort = scale("Effort");
    const mental = scale("Mental Demand");
    stopBeforeReact(effort);
    stopBeforeReact(mental);
    tap(effort);
    expect(shown("Effort")).toBe("10");
    moveTo(effort, 16);
    expect(shown("Effort")).toBe("16");
    act(() => mental.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(shown("Mental Demand")).toBe("10");
  });

  it("enables Submit and sends the shown values when every scale's events skip React", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    globalThis.fetch = fetchMock;
    NASA_TLX_SCALES.forEach((s, i) => {
      stopBeforeReact(scale(s.label));
      moveTo(scale(s.label), i + 3);
    });
    expect(submit().disabled).toBe(false);
    await act(async () => submit().click());
    expect(sentBody(fetchMock).responses).toEqual(
      Object.fromEntries(NASA_TLX_SCALES.map((s, i) => [s.key, i + 3]))
    );
  });

  it("counts a scale the browser moved without any event, at the value it shows, and keeps it there", () => {
    remountWithFakeTimers();
    const performance = scale("Performance");
    // The thumb moves, but nothing is dispatched
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(performance, "4");
    expect(shown("Performance")).toBe("—");
    act(() => vi.advanceTimersByTime(NASA_TLX_SYNC_MS));
    expect(shown("Performance")).toBe("4");
    // Another scale's answer re-renders the form, and Performance stays at 4
    tap(scale("Effort"));
    expect(performance.value).toBe("4");
    expect(shown("Performance")).toBe("4");
  });

  it("still leaves a scale nobody moved or touched unanswered, focus included, however long the form is open", () => {
    remountWithFakeTimers();
    act(() => scale("Temporal Demand").focus());
    act(() => vi.advanceTimersByTime(NASA_TLX_SYNC_MS * 20));
    for (const s of NASA_TLX_SCALES) expect(shown(s.label)).toBe("—");
    expect(submit().disabled).toBe(true);
  });

  it("stops checking once closed", () => {
    remountWithFakeTimers();
    expect(vi.getTimerCount()).toBe(1);
    act(() => root.render(<NasaTlx open={false} sessionNumber={1} sessionId={SESSION_ID} onComplete={onComplete} />));
    expect(vi.getTimerCount()).toBe(0);
  });
});
