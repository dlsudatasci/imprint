import { describe, it, expect } from "vitest";
import { SIDEWALK_GUIDE } from "./sidewalkGuide.js";

describe("SIDEWALK_GUIDE (6 Oct 2026)", () => {
  const text = SIDEWALK_GUIDE.join(" ");

  it("has eight points", () => {
    expect(SIDEWALK_GUIDE).toHaveLength(8);
  });

  it("follows chapter 4: curb ramps, crosswalks, planting beds, the full footprint, No sidewalk", () => {
    expect(text).toMatch(/curb ramps/);
    expect(text).toMatch(/crosswalk/);
    expect(text).toMatch(/planting beds/);
    expect(text).toMatch(/runs under/);
    expect(text).toMatch(/No sidewalk/);
  });

  it("covers trees, planting strips and planting beds without cut outs (6 Oct 2026)", () => {
    expect(text).toMatch(/A tree and the small box or planter around it/);
    expect(text).toMatch(/Trace the outline along a planting strip/);
    expect(text).toMatch(/one shape on each side/);
    expect(text).not.toMatch(/Cut out/i);
  });

  it("has no em dash or semicolon", () => {
    for (const point of SIDEWALK_GUIDE) expect(point).not.toMatch(/[—;]/);
  });
});
