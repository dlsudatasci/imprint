import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq, createMockRes } from "@/test-utils/api-helpers";
import { createFakeDb } from "@/test-utils/fakeMongo";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("@/util/telemetryLogger", () => ({ logTelemetryEvent: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { resetLeaderboardState, VIEW_LOG_GAP_MS } from "@/util/leaderboard.mjs";
import handler from "@/pages/api/leaderboard/index.js";
import nameHandler from "@/pages/api/leaderboard/name.js";

/**
 * S32 (17 Nov 2026): GET /api/leaderboard, on the in-memory database. Three
 * contributors with 3, 2 and 1 photos, a newcomer with none, an annotator
 * and an admin.
 */
const U = (n) => n.toString(16).padStart(24, "0");
const [FIRST, SECOND, THIRD, NEWCOMER, ANNOTATOR, ADMIN] = [1, 2, 3, 4, 5, 6].map(U);

function setup(viewer = FIRST) {
  const users = [
    { _id: FIRST, username: "alon", email: "alon@example.com", city: "makati", role: "user", leaderboardName: "shown" },
    { _id: SECOND, username: "bituin", email: "bituin@example.com", city: "pasig" },
    { _id: THIRD, username: "dalisay", email: "dalisay@example.com", role: "user", leaderboardName: "hidden" },
    { _id: NEWCOMER, username: "newcomer", email: "new@example.com", role: "user" },
    { _id: ANNOTATOR, username: "paid", email: "paid@example.com", role: "annotator" },
    { _id: ADMIN, username: "boss", email: "boss@example.com", role: "admin" },
  ];
  const annotations = [];
  [FIRST, SECOND, THIRD].forEach((person, i) => {
    for (let p = 0; p < 3 - i; p++) annotations.push({ userId: person, imageID: p, status: "completed", date: new Date(1000 * (i + 1)) });
  });
  const fake = createFakeDb({ users, annotations });
  connectToDatabase.mockResolvedValue({ db: fake.db });
  getServerSession.mockResolvedValue(viewer ? { user: { _id: viewer, username: "x" } } : null);
  return fake;
}
const signInAs = (viewer) => getServerSession.mockResolvedValue({ user: { _id: viewer, username: "x" } });

async function call(h = handler, overrides = { method: "GET" }) {
  const res = createMockRes();
  await h(createMockReq(overrides), res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLeaderboardState();
});
afterEach(() => vi.useRealTimers());

describe("GET /api/leaderboard", () => {
  it("answers the board and the viewer's place", async () => {
    setup(SECOND);
    const res = await call();
    expect(res._status).toBe(200);
    expect(res._json.top).toEqual([
      { rank: 1, name: "alon", photos: 3, isYou: false },
      { rank: 2, name: "Imprint Contributor #1", photos: 2, isYou: true },
      { rank: 3, name: "Imprint Contributor #2", photos: 1, isYou: false },
    ]);
    expect(res._json.you).toEqual({ rank: 2, photos: 2, name: "Imprint Contributor #1", nameChoice: null });
    expect(Number.isNaN(Date.parse(res._json.updatedAt))).toBe(false);
    expect(res._headers["Cache-Control"]).toBe("private, no-store");
  });

  it("returns 401 signed out", async () => {
    setup(null);
    expect((await call())._status).toBe(401);
    expect(logTelemetryEvent).not.toHaveBeenCalled();
  });

  it("returns 403 for an annotator, with no board in the answer", async () => {
    setup(ANNOTATOR);
    const res = await call();
    expect(res._status).toBe(403);
    expect(res._json).not.toHaveProperty("top");
    expect(logTelemetryEvent).not.toHaveBeenCalled();
  });

  it("shows an admin the board with no place of their own, and logs no view", async () => {
    setup(ADMIN);
    const res = await call();
    expect(res._status).toBe(200);
    expect(res._json.top).toHaveLength(3);
    expect(res._json.you).toBeNull();
    expect(logTelemetryEvent).not.toHaveBeenCalled();
  });

  it("gives a contributor with no counted photo a null place and 0 photos", async () => {
    setup(NEWCOMER);
    expect((await call())._json.you).toEqual({ rank: null, photos: 0, nameChoice: null });
    expect(logTelemetryEvent).toHaveBeenCalledWith({ event: "LEADERBOARD_VIEWED", userId: NEWCOMER, rank: null, photos: 0 });
  });

  it("never sends an account id, an email or a city", async () => {
    setup(THIRD);
    const sent = JSON.stringify((await call())._json);
    expect(sent).not.toMatch(/[0-9a-f]{24}/);
    expect(sent).not.toContain("@");
    expect(sent).not.toMatch(/makati|pasig|email|userKey|_id/i);
    // The two who did not choose to be shown are not named
    expect(sent).not.toMatch(/bituin|dalisay/);
  });

  it("logs LEADERBOARD_VIEWED with the rank and count, at most once per person in 10 minutes", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T00:00:00.000Z") });
    setup(THIRD);
    await call();
    await call();
    expect(logTelemetryEvent).toHaveBeenCalledTimes(1);
    expect(logTelemetryEvent).toHaveBeenCalledWith({ event: "LEADERBOARD_VIEWED", userId: THIRD, rank: 3, photos: 1 });

    // Someone else's view is their own
    signInAs(FIRST);
    await call();
    expect(logTelemetryEvent).toHaveBeenCalledTimes(2);

    signInAs(THIRD);
    vi.advanceTimersByTime(VIEW_LOG_GAP_MS - 1);
    await call();
    expect(logTelemetryEvent).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    await call();
    expect(logTelemetryEvent).toHaveBeenCalledTimes(3);
  });

  it("shows a changed name choice on the next GET, inside the 5 minutes the counts are kept", async () => {
    setup(SECOND);
    expect((await call())._json.you.name).toBe("Imprint Contributor #1");

    expect((await call(nameHandler, { method: "POST", body: { show: true } }))._status).toBe(200);
    const shown = (await call())._json;
    expect(shown.you).toEqual({ rank: 2, photos: 2, name: "bituin", nameChoice: "shown" });
    expect(shown.top[1]).toEqual({ rank: 2, name: "bituin", photos: 2, isYou: true });

    await call(nameHandler, { method: "POST", body: { show: false } });
    const hidden = (await call())._json;
    expect(hidden.you).toEqual({ rank: 2, photos: 2, name: "Imprint Contributor #1", nameChoice: "hidden" });
  });

  it("returns 404 when the account is not found", async () => {
    setup(U(99));
    expect((await call())._status).toBe(404);
  });

  it("returns 405 for other methods", async () => {
    setup();
    const res = await call(handler, { method: "POST" });
    expect(res._status).toBe(405);
    expect(res._headers.Allow).toEqual(["GET"]);
  });

  it("returns 500 when the database fails", async () => {
    setup();
    connectToDatabase.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call();
    expect(res._status).toBe(500);
    expect(res._json).not.toHaveProperty("top");
  });
});
