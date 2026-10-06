// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  readSessionData,
  readCount,
  readTotalCount,
  readCurrentCount,
  writeSession,
  writeCurrentCount,
  clearSession,
  hasCachedSession,
  writeTutorialFlag,
  readTutorialFlag,
  SESSION_KEYS,
} from "./sessionCache.js";

const { TOTAL_KEY, CURRENT_KEY, DATA_KEY } = SESSION_KEYS;

beforeEach(() => {
  window.localStorage.clear();
});

describe("readSessionData", () => {
  it("returns null when nothing is stored", () => {
    expect(readSessionData()).toBeNull();
  });

  it("returns parsed JSON when valid data is stored", () => {
    window.localStorage.setItem(DATA_KEY, JSON.stringify({ imgRecords: [] }));
    expect(readSessionData()).toEqual({ imgRecords: [] });
  });

  it("returns null for corrupt JSON", () => {
    window.localStorage.setItem(DATA_KEY, "not valid json");
    expect(readSessionData()).toBeNull();
  });

  it('returns null for the string "null"', () => {
    window.localStorage.setItem(DATA_KEY, "null");
    expect(readSessionData()).toBeNull();
  });

  it('returns null for the string "undefined"', () => {
    window.localStorage.setItem(DATA_KEY, "undefined");
    expect(readSessionData()).toBeNull();
  });
});

describe("readCount", () => {
  it("returns null when key is missing", () => {
    expect(readCount(TOTAL_KEY)).toBeNull();
  });

  it("returns the integer when a valid number is stored", () => {
    window.localStorage.setItem(TOTAL_KEY, "10");
    expect(readCount(TOTAL_KEY)).toBe(10);
  });

  it("returns null for non-numeric values", () => {
    window.localStorage.setItem(TOTAL_KEY, "abc");
    expect(readCount(TOTAL_KEY)).toBeNull();
  });

  it("returns null for NaN-producing values", () => {
    window.localStorage.setItem(TOTAL_KEY, "null");
    expect(readCount(TOTAL_KEY)).toBeNull();
  });
});

describe("readTotalCount / readCurrentCount", () => {
  it("reads from the correct keys", () => {
    window.localStorage.setItem(TOTAL_KEY, "20");
    window.localStorage.setItem(CURRENT_KEY, "5");
    expect(readTotalCount()).toBe(20);
    expect(readCurrentCount()).toBe(5);
  });
});

describe("writeSession", () => {
  it("writes total, current, and data", () => {
    writeSession({ total: 10, current: 3, data: { imgRecords: [1] } });
    expect(readTotalCount()).toBe(10);
    expect(readCurrentCount()).toBe(3);
    expect(readSessionData()).toEqual({ imgRecords: [1] });
  });

  it("writes only the fields provided", () => {
    writeSession({ total: 10 });
    expect(readTotalCount()).toBe(10);
    expect(readCurrentCount()).toBeNull();
    expect(readSessionData()).toBeNull();
  });

  it("does not overwrite fields not provided", () => {
    writeSession({ total: 10, current: 1, data: {} });
    writeSession({ current: 5 });
    expect(readTotalCount()).toBe(10);
    expect(readCurrentCount()).toBe(5);
  });
});

describe("writeCurrentCount", () => {
  it("updates only the current count", () => {
    writeSession({ total: 10, current: 1 });
    writeCurrentCount(7);
    expect(readCurrentCount()).toBe(7);
    expect(readTotalCount()).toBe(10);
  });
});

describe("clearSession", () => {
  it("removes all session keys including tutorial flag", () => {
    writeSession({ total: 10, current: 3, data: { x: 1 } });
    writeTutorialFlag(true);
    clearSession();
    expect(readTotalCount()).toBeNull();
    expect(readCurrentCount()).toBeNull();
    expect(readSessionData()).toBeNull();
    expect(readTutorialFlag()).toBe(false);
  });
});

describe("writeTutorialFlag / readTutorialFlag", () => {
  it("returns false when no flag is set", () => {
    expect(readTutorialFlag()).toBe(false);
  });

  it("returns true after setting the flag", () => {
    writeTutorialFlag(true);
    expect(readTutorialFlag()).toBe(true);
  });

  it("returns false after clearing the flag", () => {
    writeTutorialFlag(true);
    writeTutorialFlag(false);
    expect(readTutorialFlag()).toBe(false);
  });

  it("is independent of session data", () => {
    writeSession({ total: 10, current: 1, data: {} });
    expect(readTutorialFlag()).toBe(false);
    writeTutorialFlag(true);
    expect(readTotalCount()).toBe(10);
  });

  it("is cleared by clearSession", () => {
    writeTutorialFlag(true);
    clearSession();
    expect(readTutorialFlag()).toBe(false);
  });
});

describe("hasCachedSession", () => {
  it("returns false when nothing is cached", () => {
    expect(hasCachedSession()).toBe(false);
  });

  it("returns true when all three fields are present", () => {
    writeSession({ total: 10, current: 1, data: { imgRecords: [] } });
    expect(hasCachedSession()).toBe(true);
  });

  it("returns false when data is missing", () => {
    writeSession({ total: 10, current: 1 });
    expect(hasCachedSession()).toBe(false);
  });

  it("returns false when total is missing", () => {
    writeSession({ current: 1, data: {} });
    expect(hasCachedSession()).toBe(false);
  });

  it("returns false when current is missing", () => {
    writeSession({ total: 10, data: {} });
    expect(hasCachedSession()).toBe(false);
  });
});
