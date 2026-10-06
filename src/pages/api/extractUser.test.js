import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./extractUser.js";

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
