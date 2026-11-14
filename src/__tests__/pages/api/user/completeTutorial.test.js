import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "@/pages/api/user/completeTutorial.js";

/**
 * A users collection holding one account, which applies `$set` and honours
 * `{ field: { $exists: false } }` in a filter: enough to show the first
 * completion is recorded once (S30, 14 Nov 2026).
 */
function usersHolding(doc) {
  const matches = (filter) => Object.entries(filter).every(([key, cond]) => {
    if (key === "_id") return true;
    if (cond && typeof cond === "object" && "$exists" in cond) return (key in doc) === cond.$exists;
    if (cond && typeof cond === "object" && "$ne" in cond) return doc[key] !== cond.$ne;
    return doc[key] === cond;
  });
  return createMockCollection({
    findOne: vi.fn(async () => ({ ...doc })),
    updateOne: vi.fn(async (filter, update) => {
      if (!matches(filter)) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(doc, update.$set);
      return { matchedCount: 1, modifiedCount: 1 };
    }),
  });
}

function setupMocks({ hasSession = true, user = {} } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession({ _id: MOCK_USER_ID }) : null
  );
  const doc = { username: "testuser", ...user };
  const usersCol = usersHolding(doc);
  const db = createMockDb({ users: usersCol });
  connectToDatabase.mockResolvedValue({ db });
  return { db, usersCol, doc };
}

const post = async () => {
  const req = createMockReq({ body: {} });
  const res = createMockRes();
  await handler(req, res);
  return res;
};

beforeEach(() => { vi.clearAllMocks(); });

describe("POST /api/user/completeTutorial", () => {
  it("returns 200 on success", async () => {
    setupMocks();
    const res = await post();
    expect(res._status).toBe(200);
    expect(res._json.message).toContain("successfully");
  });

  it("sets hasCompletedTutorial to true", async () => {
    const mocks = setupMocks();
    await post();
    const [, update] = mocks.usersCol.updateOne.mock.calls.at(-1);
    expect(update.$set.hasCompletedTutorial).toBe(true);
    expect(mocks.doc.hasCompletedTutorial).toBe(true);
  });

  // S30 (14 Nov 2026): who did which tutorial
  it("records a contributor's first completion as version 2, with its date", async () => {
    const mocks = setupMocks({ user: { role: "contributor" } });
    const before = Date.now();
    await post();
    expect(mocks.doc.tutorialVersion).toBe(2);
    expect(mocks.doc.tutorialCompletedAt).toBeInstanceOf(Date);
    expect(mocks.doc.tutorialCompletedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("records an account with no role as a contributor's, and an annotator's as version 1", async () => {
    const contributor = setupMocks();
    await post();
    expect(contributor.doc.tutorialVersion).toBe(2);
    const annotator = setupMocks({ user: { role: "annotator" } });
    await post();
    expect(annotator.doc.tutorialVersion).toBe(1);
    expect(annotator.doc.tutorialCompletedAt).toBeInstanceOf(Date);
  });

  it("leaves the first completion's date and version as they were on a replay", async () => {
    const first = new Date("2026-11-01T02:00:00Z");
    const mocks = setupMocks({ user: { role: "contributor", hasCompletedTutorial: true, tutorialCompletedAt: first, tutorialVersion: 2 } });
    await post();
    expect(mocks.doc.tutorialCompletedAt).toBe(first);
    expect(mocks.doc.tutorialVersion).toBe(2);
    expect(mocks.doc.hasCompletedTutorial).toBe(true);
    // A second call on a fresh account too
    const fresh = setupMocks({ user: { role: "contributor" } });
    await post();
    const at = fresh.doc.tutorialCompletedAt;
    await post();
    expect(fresh.doc.tutorialCompletedAt).toBe(at);
    expect(fresh.doc.tutorialVersion).toBe(2);
  });

  it("writes no date or version to an account that finished before S30 and replays it", async () => {
    // Version 1, by having neither field (the exports read a missing version as 1)
    const mocks = setupMocks({ user: { role: "contributor", hasCompletedTutorial: true } });
    const res = await post();
    expect(res._status).toBe(200);
    expect(mocks.doc).not.toHaveProperty("tutorialCompletedAt");
    expect(mocks.doc).not.toHaveProperty("tutorialVersion");
    expect(mocks.doc.hasCompletedTutorial).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const res = await post();
    expect(res._status).toBe(401);
  });

  it("returns 405 for non-POST methods", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it("returns 500 when the database fails", async () => {
    setupMocks();
    connectToDatabase.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post();
    expect(res._status).toBe(500);
  });
});
