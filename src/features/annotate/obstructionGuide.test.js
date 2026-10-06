import { describe, it, expect } from "vitest";
import { OBSTRUCTION_GUIDE } from "./obstructionGuide.js";

describe("OBSTRUCTION_GUIDE (4 Oct 2026)", () => {
  it("has five points", () => {
    expect(OBSTRUCTION_GUIDE).toHaveLength(5);
  });

  it("makes the judgment the annotator's own", () => {
    const text = OBSTRUCTION_GUIDE.join(" ");
    expect(text).toMatch(/\byou\b/);
    expect(text).toMatch(/Judge for yourself, not for an average pedestrian/);
  });

  it("says objects outside the walking space, such as a car on the road, do not obstruct", () => {
    expect(OBSTRUCTION_GUIDE.join(" ")).toMatch(/car on the road/);
  });

  it("points back to Objects for box and category fixes", () => {
    expect(OBSTRUCTION_GUIDE.join(" ")).toMatch(/go back to Objects/);
  });

  it("has no em dash or semicolon", () => {
    for (const point of OBSTRUCTION_GUIDE) expect(point).not.toMatch(/[—;]/);
  });
});
