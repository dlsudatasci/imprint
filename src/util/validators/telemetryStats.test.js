import { describe, it, expect } from "vitest";
import { getManilaDateString, calculateStreak } from "./telemetryStats.js";

describe("getManilaDateString", () => {
  it("converts UTC midnight to Manila morning (same day)", () => {
    const utcMidnight = new Date("2026-09-15T00:00:00Z");
    expect(getManilaDateString(utcMidnight)).toBe("2026-09-15");
  });

  it("converts UTC noon to Manila evening (same day)", () => {
    const utcNoon = new Date("2026-09-15T04:00:00Z");
    expect(getManilaDateString(utcNoon)).toBe("2026-09-15");
  });

  it("converts just before Manila midnight to same day", () => {
    const justBefore = new Date("2026-09-15T15:59:00Z");
    expect(getManilaDateString(justBefore)).toBe("2026-09-15");
  });

  it("converts just after Manila midnight to next day", () => {
    const justAfter = new Date("2026-09-15T16:01:00Z");
    expect(getManilaDateString(justAfter)).toBe("2026-09-16");
  });
});

describe("calculateStreak", () => {
  function manilaToday() {
    return getManilaDateString(new Date());
  }

  function manilaYesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getManilaDateString(d);
  }

  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return getManilaDateString(d);
  }

  it("returns 0 for empty array", () => {
    expect(calculateStreak([])).toBe(0);
  });

  it("returns 0 for null/undefined", () => {
    expect(calculateStreak(null)).toBe(0);
    expect(calculateStreak(undefined)).toBe(0);
  });

  it("returns 1 for only today", () => {
    expect(calculateStreak([manilaToday()])).toBe(1);
  });

  it("returns 1 for only yesterday", () => {
    expect(calculateStreak([manilaYesterday()])).toBe(1);
  });

  it("returns 2 for today + yesterday", () => {
    expect(calculateStreak([manilaToday(), manilaYesterday()])).toBe(2);
  });

  it("returns 0 when most recent is 2+ days ago", () => {
    expect(calculateStreak([daysAgo(2)])).toBe(0);
  });

  it("counts consecutive days correctly", () => {
    const dates = [
      manilaToday(),
      manilaYesterday(),
      daysAgo(2),
      daysAgo(3),
      daysAgo(4),
    ];
    expect(calculateStreak(dates)).toBe(5);
  });

  it("stops at a gap", () => {
    const dates = [
      manilaToday(),
      manilaYesterday(),
      daysAgo(3),
    ];
    expect(calculateStreak(dates)).toBe(2);
  });
});
