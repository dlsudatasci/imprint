import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes } from "@/test-utils/api-helpers";
import { createFakeDb } from "@/test-utils/fakeMongo";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("@/util/telemetryLogger", () => ({ logTelemetryEvent: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import handler from "@/pages/api/leaderboard/name.js";

/**
 * S32 (17 Nov 2026): POST /api/leaderboard/name, a contributor's choice to
 * show their username on the leaderboard or a number instead.
 */
const ME = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "bbbbbbbbbbbbbbbbbbbbbbbb";

function setup({ user = { role: "user" }, hasSession = true } = {}) {
  const fake = createFakeDb({
    users: [...(user ? [{ _id: ME, username: "alon", ...user }] : []), { _id: OTHER, username: "bituin", role: "user" }],
  });
  connectToDatabase.mockResolvedValue({ db: fake.db });
  getServerSession.mockResolvedValue(hasSession ? { user: { _id: ME, username: "alon" } } : null);
  const me = () => fake.collections.users.rows.find((u) => u._id === ME);
  const other = () => fake.collections.users.rows.find((u) => u._id === OTHER);
  return { me, other };
}

async function post(body, method = "POST") {
  const res = createMockRes();
  await handler(createMockReq({ method, body }), res);
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/leaderboard/name", () => {
  it("saves Show as leaderboardName \"shown\" with the time, and logs it", async () => {
    const { me, other } = setup();
    const before = Date.now();
    const res = await post({ show: true });
    expect(res._status).toBe(200);
    expect(res._json).toEqual({ nameChoice: "shown" });
    expect(me().leaderboardName).toBe("shown");
    expect(me().leaderboardChoiceAt).toBeInstanceOf(Date);
    expect(me().leaderboardChoiceAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(other()).not.toHaveProperty("leaderboardName");
    expect(logTelemetryEvent).toHaveBeenCalledTimes(1);
    expect(logTelemetryEvent).toHaveBeenCalledWith({ event: "LEADERBOARD_NAME_CHOSEN", userId: ME, shown: true });
  });

  it("saves Hide as \"hidden\", and logs each choice", async () => {
    const { me } = setup({ user: { role: "user", leaderboardName: "shown", leaderboardNumber: 4 } });
    expect((await post({ show: false }))._json).toEqual({ nameChoice: "hidden" });
    expect(me().leaderboardName).toBe("hidden");
    // The number in their hidden name is not touched
    expect(me().leaderboardNumber).toBe(4);
    await post({ show: true });
    expect(logTelemetryEvent.mock.calls.map(([e]) => e.shown)).toEqual([false, true]);
  });

  it("takes an account with no role as a contributor's", async () => {
    const { me } = setup({ user: {} });
    expect((await post({ show: true }))._status).toBe(200);
    expect(me().leaderboardName).toBe("shown");
  });

  it.each([
    ["no body", undefined],
    ["an empty body", {}],
    ["a string", { show: "true" }],
    ["a number", { show: 1 }],
    ["null", { show: null }],
  ])("refuses %s with 400 and writes nothing", async (_, body) => {
    const { me } = setup();
    expect((await post(body))._status).toBe(400);
    expect(me()).not.toHaveProperty("leaderboardName");
    expect(logTelemetryEvent).not.toHaveBeenCalled();
  });

  it.each(["annotator", "admin"])("refuses an %s with 403 and writes nothing", async (role) => {
    const { me } = setup({ user: { role } });
    expect((await post({ show: true }))._status).toBe(403);
    expect(me()).not.toHaveProperty("leaderboardName");
    expect(logTelemetryEvent).not.toHaveBeenCalled();
  });

  it("returns 401 signed out", async () => {
    const { me } = setup({ hasSession: false });
    expect((await post({ show: true }))._status).toBe(401);
    expect(me()).not.toHaveProperty("leaderboardName");
  });

  it("returns 404 when the account is not found", async () => {
    setup({ user: null });
    expect((await post({ show: true }))._status).toBe(404);
    expect(logTelemetryEvent).not.toHaveBeenCalled();
  });

  it("returns 405 for other methods", async () => {
    setup();
    const res = await post({ show: true }, "GET");
    expect(res._status).toBe(405);
    expect(res._headers.Allow).toEqual(["POST"]);
  });

  it("returns 500 when the database fails", async () => {
    setup();
    connectToDatabase.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post({ show: true }))._status).toBe(500);
    expect(logTelemetryEvent).not.toHaveBeenCalled();
  });
});
