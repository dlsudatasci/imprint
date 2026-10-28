// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeSession, writeTutorialFlag, readSessionData, readTutorialFlag } from "@/util/sessionCache";
import { syncCachedSession } from "./syncCachedSession";

// 27 Oct 2026: the dashboard and navbar trusted a saved copy of a session finished on another device
const batch = (...ids) => ({ imgRecords: ids.map((_id) => ({ _id })) });
const server = (body, ok = true) => { globalThis.fetch = vi.fn(async () => ({ ok, json: async () => body })); };

beforeEach(() => {
  window.localStorage.clear();
  writeSession({ total: 2, current: 2, data: batch("a", "b") });
});

describe("syncCachedSession", () => {
  it("keeps a saved copy that is still the current session", async () => {
    server({ isExistingSession: true, currentCount: 1, ...batch("a", "b") });
    expect(await syncCachedSession()).toEqual({ active: true, current: 2, total: 2 });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/annotationGet", expect.objectContaining({ body: "{}" }));
  });

  it("clears a saved copy of a session that ended elsewhere", async () => {
    server({ imgRecords: [] });
    expect(await syncCachedSession()).toEqual({ active: false });
    expect(readSessionData()).toBeNull();
  });

  it("puts the current session in place of another one", async () => {
    writeTutorialFlag(true);
    server({ isExistingSession: true, currentCount: 3, ...batch("c", "d", "e") });
    expect(await syncCachedSession()).toEqual({ active: true, current: 3, total: 3 });
    expect(readSessionData().imgRecords.map((i) => i._id)).toEqual(["c", "d", "e"]);
    expect(readTutorialFlag()).toBe(false);
  });

  it("changes nothing when the server cannot be asked", async () => {
    server({}, false);
    expect(await syncCachedSession()).toBeNull();
    globalThis.fetch = vi.fn(async () => { throw new Error("offline"); });
    expect(await syncCachedSession()).toBeNull();
    expect(readSessionData()).not.toBeNull();
  });
});
