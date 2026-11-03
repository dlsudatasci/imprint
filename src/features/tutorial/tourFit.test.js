import { describe, it, expect, afterEach } from "vitest";
import { roomBeside, fitBesideTarget, whenStill, CARD_MIN_PX, CARD_GAP_PX, SCREEN_EDGE_PX, STILL_FRAMES, STILL_MAX_MS } from "./tourFit";

/** A tour card no taller than the room beside its target (S16b, 3 Nov 2026) */
describe("roomBeside", () => {
  it("is the room above or below the target, less the gaps", () => {
    const target = { top: 400, bottom: 450 };
    expect(roomBeside(target, "top", 800)).toBe(400 - CARD_GAP_PX - SCREEN_EDGE_PX);
    expect(roomBeside(target, "bottom", 800)).toBe(800 - 450 - CARD_GAP_PX - SCREEN_EDGE_PX);
  });

  it("is never under the card's least height", () => {
    expect(roomBeside({ top: 40, bottom: 80 }, "top", 600)).toBe(CARD_MIN_PX);
    expect(roomBeside({ top: 500, bottom: 590 }, "bottom", 600)).toBe(CARD_MIN_PX);
  });
});

describe("fitBesideTarget", () => {
  afterEach(() => {
    delete globalThis.window;
  });
  const run = (placement, rect, floating) => {
    globalThis.window = { innerHeight: 700 };
    return fitBesideTarget.fn({ placement, elements: { reference: { getBoundingClientRect: () => rect }, floating } });
  };
  const floatingEl = () => {
    const props = {};
    return { props, style: { getPropertyValue: (k) => props[k] ?? "", setProperty: (k, v) => { props[k] = v; } } };
  };

  it("caps the card at the room on its side and asks to measure again, once", () => {
    const el = floatingEl();
    expect(run("top", { top: 420, bottom: 460 }, el)).toEqual({ reset: { rects: true } });
    expect(el.props["--tour-max-h"]).toBe(`${420 - CARD_GAP_PX - SCREEN_EDGE_PX}px`);
    expect(run("top", { top: 420, bottom: 460 }, el)).toEqual({});
    expect(run("bottom-start", { top: 120, bottom: 160 }, el)).toEqual({ reset: { rects: true } });
    expect(el.props["--tour-max-h"]).toBe(`${700 - 160 - CARD_GAP_PX - SCREEN_EDGE_PX}px`);
  });
});

// S16b (3 Nov 2026): on a slower phone the highlight was measured while the sheet still slid
describe("whenStill", () => {
  afterEach(() => {
    delete globalThis.document;
  });
  // A target at the given tops, one per frame, then still at the last; frames run at once
  const run = (tops, { maxMs = Infinity } = {}) => {
    let i = 0;
    let frames = 0;
    let clock = 0;
    globalThis.document = { querySelector: () => ({ getBoundingClientRect: () => ({ top: tops[Math.min(i, tops.length - 1)], left: 0, height: 100 }) }) };
    const frame = (f) => {
      frames += 1;
      i += 1;
      clock += 16;
      if (clock > maxMs + 100) throw new Error("ran past its limit");
      f();
    };
    return whenStill("#x", { frame, now: () => clock }).then(() => ({ frames, settledAt: tops[Math.min(i, tops.length - 1)] }));
  };

  it("waits until the target has kept its place for STILL_FRAMES frames", async () => {
    const tops = [600, 500, 400, 320, 280, 266, 265];
    const { frames, settledAt } = await run(tops);
    expect(settledAt).toBe(265);
    // Each frame of sliding (the first check is a frame in), then STILL_FRAMES more at 265
    expect(frames).toBe(tops.length - 1 + STILL_FRAMES);
  });

  it("gives up after STILL_MAX_MS on a target that never keeps still", async () => {
    const moving = Array.from({ length: 1000 }, (_, k) => 600 - k);
    const { frames } = await run(moving, { maxMs: STILL_MAX_MS });
    expect(frames * 16).toBeGreaterThan(STILL_MAX_MS);
    expect(frames * 16).toBeLessThan(STILL_MAX_MS + 50);
  });
});
