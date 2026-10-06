import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./contributors.js";

function setupAdminMocks(contributors = []) {
  getServerSession.mockResolvedValue(mockAuthSession({ role: "admin" }));

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "admin" }),
  });

  const annotationsCol = createMockCollection({
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(contributors),
    }),
  });

  const db = createMockDb({
    users: usersCol,
    annotations: annotationsCol,
  });

  connectToDatabase.mockResolvedValue({ db });
  return { db, annotationsCol };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/contributors", () => {
  it("returns 405 for non-GET methods", async () => {
    const req = createMockReq({ method: "POST" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(405);
  });

  it("returns 401 when not authenticated", async () => {
    getServerSession.mockResolvedValue(null);
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    getServerSession.mockResolvedValue(mockAuthSession({ role: "user" }));
    const usersCol = createMockCollection({
      findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "user" }),
    });
    const db = createMockDb({ users: usersCol });
    connectToDatabase.mockResolvedValue({ db });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(403);
  });

  it("returns contributor list for admin", async () => {
    const mockContributors = [
      {
        userId: "user-1",
        username: "alice",
        totalAnnotations: 42,
        sessionCount: 5,
        lastActive: new Date("2026-09-15"),
        avgTimePerImageMs: 15000,
      },
    ];
    setupAdminMocks(mockContributors);
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toHaveProperty("contributors");
    expect(res._json.contributors).toEqual(mockContributors);
  });

  it("returns empty array when no contributors exist", async () => {
    setupAdminMocks([]);
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.contributors).toEqual([]);
  });
});
