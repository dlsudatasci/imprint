import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "@/pages/api/user/tourHintSeen.js";

/**
 * S30 (14 Nov 2026): the one-time line saying where the tour is, recorded on
 * the account so another device does not show it again. The fake account
 * applies `$set` and honours `$exists` in the filter, as completeTutorial's.
 */
function setupMocks({ hasSession = true, user = { role: "contributor" } } = {}) {
  getServerSession.mockResolvedValue(hasSession ? mockAuthSession({ _id: MOCK_USER_ID }) : null);
  const doc = user ? { ...user } : null;
  const usersCol = createMockCollection({
    findOne: vi.fn(async () => (doc ? { ...doc } : null)),
    updateOne: vi.fn(async (filter, update) => {
      const ok = Object.entries(filter).every(([key, cond]) => key === "_id" || (key in doc) === cond.$exists);
      if (ok) Object.assign(doc, update.$set);
      return { matchedCount: ok ? 1 : 0, modifiedCount: ok ? 1 : 0 };
    }),
  });
  connectToDatabase.mockResolvedValue({ db: createMockDb({ users: usersCol }) });
  return { usersCol, doc };
}

const post = async (method = "POST") => {
  const res = createMockRes();
  await handler(createMockReq({ method, body: {} }), res);
  return res;
};

beforeEach(() => { vi.clearAllMocks(); });

describe("POST /api/user/tourHintSeen", () => {
  it("sets tourHintSeenAt on a contributor's account", async () => {
    const { doc } = setupMocks();
    const before = Date.now();
    const res = await post();
    expect(res._status).toBe(200);
    expect(doc.tourHintSeenAt).toBeInstanceOf(Date);
    expect(doc.tourHintSeenAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("sets the date once: a second call leaves it as it was", async () => {
    const { doc } = setupMocks();
    await post();
    const first = doc.tourHintSeenAt;
    await post();
    expect(doc.tourHintSeenAt).toBe(first);
  });

  it("counts an account with no role as a contributor's", async () => {
    const { doc } = setupMocks({ user: {} });
    expect((await post())._status).toBe(200);
    expect(doc.tourHintSeenAt).toBeInstanceOf(Date);
  });

  it("refuses an annotator, who has no tour in sessions, and writes nothing", async () => {
    const { doc, usersCol } = setupMocks({ user: { role: "annotator" } });
    expect((await post())._status).toBe(403);
    expect(usersCol.updateOne).not.toHaveBeenCalled();
    expect(doc).not.toHaveProperty("tourHintSeenAt");
  });

  it("returns 401 without a session", async () => {
    const { usersCol } = setupMocks({ hasSession: false });
    expect((await post())._status).toBe(401);
    expect(usersCol.updateOne).not.toHaveBeenCalled();
  });

  it("returns 404 when the account is not found", async () => {
    setupMocks({ user: null });
    expect((await post())._status).toBe(404);
  });

  it("returns 405 for other methods", async () => {
    expect((await post("GET"))._status).toBe(405);
  });

  it("returns 500 when the database fails", async () => {
    setupMocks();
    connectToDatabase.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post())._status).toBe(500);
  });
});
