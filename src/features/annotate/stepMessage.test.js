import { describe, it, expect } from "vitest";
import { messageVisibleMs, MESSAGE_MIN_MS } from "./stepMessage";

describe("messageVisibleMs (21 Oct 2026)", () => {
  it("keeps a short message at least 5 s", () => {
    expect(messageVisibleMs("Finish or cancel the shape you are drawing.")).toBe(MESSAGE_MIN_MS);
    // 11 words
    expect(messageVisibleMs("Please tap Keep or Not an object on every suggested box.")).toBe(2000 + 11 * 300);
  });

  it("keeps a long one 2 s plus 0.3 s a word", () => {
    const long = "Please tick the box to confirm that the objects you did not mark do not obstruct the sidewalk.";
    expect(long.split(" ")).toHaveLength(18);
    expect(messageVisibleMs(long)).toBe(2000 + 18 * 300);
  });

  it("handles no message", () => {
    expect(messageVisibleMs(null)).toBe(MESSAGE_MIN_MS);
    expect(messageVisibleMs("")).toBe(MESSAGE_MIN_MS);
  });
});
