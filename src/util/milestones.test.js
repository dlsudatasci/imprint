import { describe, it, expect } from "vitest";
import {
  METERS_PER_PHOTO,
  MILESTONES,
  metersForPhotos,
  formatDistance,
  nextMilestone,
  previousMilestone,
  stepProgress,
  getCrossedMilestone,
} from "./milestones.js";

/**
 * The distance ladder (recalibrated 17 Oct 2026, IMPRINT_dashboard_audit.md).
 * chapter_5.tex: early milestones are attainable at the volume a typical
 * contributor is projected to reach. chapter_4.tex projects about 40 photos
 * each, and the deployment pool holds 675.
 */
const PROJECTED_PHOTOS = 40;
const POOL_SIZE = 675;

describe("METERS_PER_PHOTO", () => {
  it("counts 10 m of sidewalk per photo", () => {
    expect(METERS_PER_PHOTO).toBe(10);
    expect(metersForPhotos(40)).toBe(400);
  });

  it("counts nothing for a missing or negative total", () => {
    for (const v of [undefined, null, NaN, -3, "x"]) expect(metersForPhotos(v)).toBe(0);
  });
});

describe("MILESTONES", () => {
  it("is sorted shortest first, each with a place and whole metres", () => {
    for (let i = 0; i < MILESTONES.length; i++) {
      expect(MILESTONES[i].place.length).toBeGreaterThan(0);
      expect(Number.isInteger(MILESTONES[i].meters)).toBe(true);
      if (i) expect(MILESTONES[i].meters).toBeGreaterThan(MILESTONES[i - 1].meters);
    }
  });

  it("lets a typical contributor (about 40 photos) pass the first and near the second, and the whole pool reach four", () => {
    const reached = (photos) => MILESTONES.filter((m) => metersForPhotos(photos) >= m.meters).length;
    expect(reached(PROJECTED_PHOTOS)).toBe(1);
    expect(reached(45)).toBe(2);
    expect(reached(POOL_SIZE)).toBe(4);
  });

  it("names places to follow \"the length of\", never repeating it", () => {
    for (const m of MILESTONES) expect(m.place).not.toMatch(/length|distance/i);
  });
});

describe("formatDistance", () => {
  it("shows metres under a kilometre and kilometres from there", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(400)).toBe("400 m");
    expect(formatDistance(2164)).toBe("2.16 km");
    expect(formatDistance(23800)).toBe("23.8 km");
    expect(formatDistance(3379730)).toBe("3,379.73 km");
  });
});

describe("nextMilestone", () => {
  it("is the first one still ahead, and null past the last", () => {
    expect(nextMilestone(0).place).toBe("Jones Bridge");
    expect(nextMilestone(115).place).toBe("Quezon Bridge");
    expect(nextMilestone(MILESTONES.at(-1).meters)).toBeNull();
  });
});

describe("getCrossedMilestone", () => {
  it("returns null when nothing is crossed", () => {
    expect(getCrossedMilestone(0, 0)).toBeNull();
    expect(getCrossedMilestone(0, 11)).toBeNull();
    expect(getCrossedMilestone(20, 30)).toBeNull();
  });

  it("crosses Jones Bridge at the 12th photo, on the exact boundary", () => {
    expect(getCrossedMilestone(11, 12).place).toBe("Jones Bridge");
  });

  it("does not cross again once past", () => {
    expect(getCrossedMilestone(12, 20)).toBeNull();
  });

  it("returns the largest when a session crosses several", () => {
    expect(getCrossedMilestone(0, 150).place).toBe("Kalaw Avenue");
    expect(getCrossedMilestone(0, 10_000_000).place).toBe(MILESTONES.at(-1).place);
  });
});

describe("previousMilestone and stepProgress (17 Oct 2026)", () => {
  it("measure each step of the ladder on its own", () => {
    expect(previousMilestone(0)).toBeNull();
    expect(stepProgress(0)).toBe(0);
    expect(previousMilestone(115).place).toBe("Jones Bridge");
    expect(stepProgress(115)).toBe(0);
    expect(stepProgress(281)).toBe(50);
    expect(stepProgress(MILESTONES.at(-1).meters)).toBe(100);
  });
});
