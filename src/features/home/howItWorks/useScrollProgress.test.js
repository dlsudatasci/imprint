import { describe, it, expect } from "vitest";
import { progressFromRect, stepToward } from "./useScrollProgress";

describe("progressFromRect", () => {
  it("is 0 before the track reaches the top, and while its top is at the top", () => {
    expect(progressFromRect(300, 7000, 1000)).toBe(0);
    expect(progressFromRect(0, 7000, 1000)).toBe(0);
  });

  it("runs from 0 to 1 over the track's height less the frame's", () => {
    expect(progressFromRect(-3000, 7000, 1000)).toBeCloseTo(0.5);
    expect(progressFromRect(-6000, 7000, 1000)).toBe(1);
    expect(progressFromRect(-9000, 7000, 1000)).toBe(1);
  });

  it("starts early by the lead, while the frame slides in, and still ends when it lets go", () => {
    // A 4.5-screen track with half a screen of lead: 4 screens in all
    expect(progressFromRect(500, 4500, 1000, 500)).toBe(0);
    expect(progressFromRect(250, 4500, 1000, 500)).toBeCloseTo(250 / 4000);
    expect(progressFromRect(0, 4500, 1000, 500)).toBeCloseTo(0.125);
    expect(progressFromRect(-3500, 4500, 1000, 500)).toBe(1);
    expect(progressFromRect(800, 4500, 1000, 500)).toBe(0);
  });

  it("is 0 when the track is no taller than the frame, or a value is missing", () => {
    expect(progressFromRect(-10, 1000, 1000)).toBe(0);
    expect(progressFromRect(-10, 800, 1000)).toBe(0);
    expect(progressFromRect(NaN, 7000, 1000)).toBe(0);
    expect(progressFromRect(-10, undefined, 1000)).toBe(0);
  });
});

describe("stepToward", () => {
  it("closes a share of the gap, in either direction", () => {
    expect(stepToward(0, 1, 0.2)).toBeCloseTo(0.2);
    expect(stepToward(1, 0, 0.2)).toBeCloseTo(0.8);
  });

  it("snaps once the gap is too small to see", () => {
    expect(stepToward(0.4999, 0.5)).toBe(0.5);
    expect(stepToward(0.5, 0.5)).toBe(0.5);
  });

  it("arrives in a bounded number of frames", () => {
    let shown = 0;
    let frames = 0;
    while (shown !== 1 && frames < 100) {
      shown = stepToward(shown, 1);
      frames += 1;
    }
    expect(shown).toBe(1);
    expect(frames).toBeLessThan(50);
  });
});
