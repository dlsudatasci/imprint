import { describe, it, expect } from "vitest";
import { serverTimer, SERVER_TIMING_NAMES } from "./serverTiming";

/** Server-Timing for annotationGet (S16, 3 Nov 2026): durations only, never data */
const clock = (...times) => {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)];
};

describe("serverTimer", () => {
  it("names the route's five parts, in order", () => {
    expect(SERVER_TIMING_NAMES).toEqual(["auth", "check", "draw", "prepare", "save"]);
  });

  it("records each mark as the milliseconds since the one before, in order", () => {
    const timer = serverTimer(clock(100, 112.34, 120, 160, 161, 200));
    for (const name of SERVER_TIMING_NAMES) timer.mark(name);
    expect(timer.header()).toBe("auth;dur=12.3, check;dur=7.7, draw;dur=40.0, prepare;dur=1.0, save;dur=39.0");
  });

  it("gives only the parts marked, and nothing before the first mark", () => {
    const timer = serverTimer(clock(0, 5, 9));
    expect(timer.header()).toBe("");
    timer.mark("auth");
    timer.mark("check");
    expect(timer.header()).toBe("auth;dur=5.0, check;dur=4.0");
  });

  it("refuses a name not on the list, so nothing but a duration is ever sent", () => {
    const timer = serverTimer(clock(0, 1));
    expect(() => timer.mark("user@example.com")).toThrow(/Unknown Server-Timing name/);
    expect(() => timer.mark("auth;desc=x")).toThrow();
    expect(timer.header()).toBe("");
  });

  it("never gives a negative duration, and uses performance.now by default", () => {
    const timer = serverTimer(clock(10, 5));
    timer.mark("auth");
    expect(timer.header()).toBe("auth;dur=0.0");
    const real = serverTimer();
    real.mark("draw");
    expect(real.header()).toMatch(/^draw;dur=\d+\.\d$/);
  });
});
