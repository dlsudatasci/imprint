import { describe, it, expect } from "vitest";
import {
  KILOMETERS_PER_ANNOTATION,
  MILESTONES,
  getCrossedMilestone,
} from "./milestones.js";

describe("KILOMETERS_PER_ANNOTATION", () => {
  it("equals 0.002", () => {
    expect(KILOMETERS_PER_ANNOTATION).toBe(0.002);
  });
});

describe("MILESTONES", () => {
  it("is sorted ascending by km", () => {
    for (let i = 1; i < MILESTONES.length; i++) {
      expect(MILESTONES[i].km).toBeGreaterThan(MILESTONES[i - 1].km);
    }
  });

  it("every entry has a name and a positive km", () => {
    for (const m of MILESTONES) {
      expect(typeof m.name).toBe("string");
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.km).toBeGreaterThan(0);
    }
  });
});

describe("getCrossedMilestone", () => {
  it("returns null when counts are too low to cross anything", () => {
    expect(getCrossedMilestone(0, 100)).toBeNull();
  });

  it("returns null when prev and curr are the same", () => {
    expect(getCrossedMilestone(500, 500)).toBeNull();
  });

  it("returns null for zero to zero", () => {
    expect(getCrossedMilestone(0, 0)).toBeNull();
  });

  it("crosses San Juanico Bridge at 1080 annotations (2.16 km)", () => {
    const result = getCrossedMilestone(1000, 1100);
    expect(result).not.toBeNull();
    expect(result.km).toBe(2.16);
  });

  it("crosses on exact boundary", () => {
    const result = getCrossedMilestone(1079, 1080);
    expect(result).not.toBeNull();
    expect(result.km).toBe(2.16);
  });

  it("does not cross when already past", () => {
    expect(getCrossedMilestone(1100, 1200)).toBeNull();
  });

  it("returns the largest milestone when multiple are crossed at once", () => {
    const result = getCrossedMilestone(0, 5000000);
    expect(result).not.toBeNull();
    expect(result.km).toBe(MILESTONES[MILESTONES.length - 1].km);
  });

  it("returns Roxas Boulevard when crossing from ~2 km to ~8 km", () => {
    const prev = Math.floor(2.0 / KILOMETERS_PER_ANNOTATION);
    const curr = Math.ceil(8.0 / KILOMETERS_PER_ANNOTATION);
    const result = getCrossedMilestone(prev, curr);
    expect(result).not.toBeNull();
    expect(result.km).toBe(7.6);
  });
});
