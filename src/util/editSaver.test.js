import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEditSaver } from "./editSaver";

// Saving unsubmitted edits as they happen (8 Oct 2026)
describe("createEditSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves once, after the edits have stopped for the delay", () => {
    const save = vi.fn();
    const saver = createEditSaver(save, 400);
    saver.schedule();
    vi.advanceTimersByTime(300);
    saver.schedule(); // a drag keeps editing
    vi.advanceTimersByTime(300);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.pending()).toBe(false);
  });

  it("flush saves a waiting edit at once, and does nothing when none waits", () => {
    const save = vi.fn();
    const saver = createEditSaver(save, 400);
    saver.flush();
    expect(save).not.toHaveBeenCalled();
    saver.schedule();
    expect(saver.pending()).toBe(true);
    saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("cancel drops a waiting edit", () => {
    const save = vi.fn();
    const saver = createEditSaver(save, 400);
    saver.schedule();
    saver.cancel();
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
    expect(saver.pending()).toBe(false);
  });
});
