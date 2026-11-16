import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "@/pages/api/extractUser.js";

function setupMocks({ hasSession = true, user = undefined } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession({ _id: MOCK_USER_ID }) : null
  );

  const defaultUser = {
    _id: MOCK_USER_ID,
    totalAnnotations: 42,
    activities: [{ activity: "Registered", date: new Date(), tag: "register" }],
  };

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue(user === undefined ? defaultUser : user),
  });
  const db = createMockDb({ users: usersCol });
  connectToDatabase.mockResolvedValue({ db });
  return { db, usersCol };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("POST /api/extractUser", () => {
  it("returns annotationCount and userActivities", async () => {
    setupMocks();
    const req = createMockReq({ body: {} });
    const res = createMockRes();
    await handler(req, res);
    expect(res._json.annotationCount).toBe(42);
    expect(res._json.userActivities).toHaveLength(1);
  });

  it("returns defaults when user has no data", async () => {
    setupMocks({ user: null });
    const req = createMockReq({ body: {} });
    const res = createMockRes();
    await handler(req, res);
    expect(res._json.annotationCount).toBe(0);
    expect(res._json.userActivities).toEqual([]);
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ body: {} });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 405 for non-POST methods", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});

describe("POST /api/extractUser, unread messages (S29, 16 Nov 2026)", () => {
  const message = (date) => ({ tag: "message", title: "Your first session is waiting", activity: "Start with 5 photos, about 5 minutes.", date: new Date(date), campaign: "welcome-nudge" });

  it("says a message newer than notificationsSeenAt is unread, and sends notificationsSeenAt", async () => {
    const seen = new Date("2026-11-16T01:00:00Z");
    setupMocks({ user: { totalAnnotations: 0, activities: [message("2026-11-16T02:00:00Z")], notificationsSeenAt: seen } });
    const res = createMockRes();
    await handler(createMockReq({ body: {} }), res);
    expect(res._json.hasUnreadMessage).toBe(true);
    expect(res._json.notificationsSeenAt).toEqual(seen);
    expect(res._json.userActivities).toHaveLength(1);
  });

  it("says nothing is unread for an older message, or with no message", async () => {
    setupMocks({ user: { activities: [message("2026-11-15T02:00:00Z")], notificationsSeenAt: new Date("2026-11-16T01:00:00Z") } });
    let res = createMockRes();
    await handler(createMockReq({ body: {} }), res);
    expect(res._json.hasUnreadMessage).toBe(false);
    setupMocks();
    res = createMockRes();
    await handler(createMockReq({ body: {} }), res);
    expect(res._json.hasUnreadMessage).toBe(false);
  });

  it("with { unread: true } answers only the boolean, reading only each entry's tag and date", async () => {
    const { usersCol } = setupMocks({ user: { activities: [message("2026-11-16T02:00:00Z")] } });
    const res = createMockRes();
    await handler(createMockReq({ body: { unread: true } }), res);
    expect(res._json).toEqual({ hasUnreadMessage: true });
    expect(usersCol.findOne.mock.calls[0][1].projection).toEqual({ "activities.tag": 1, "activities.date": 1, notificationsSeenAt: 1 });
  });
});
