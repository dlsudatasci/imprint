import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { requireAdmin } from "./adminAuth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAdmin", () => {
  it("returns 401 when not authenticated", async () => {
    getServerSession.mockResolvedValue(null);
    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAdmin(req, res);

    expect(result).toBeNull();
    expect(res._status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    getServerSession.mockResolvedValue(mockAuthSession());
    const usersCol = createMockCollection({
      findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "user" }),
    });
    const db = createMockDb({ users: usersCol });
    connectToDatabase.mockResolvedValue({ db });

    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAdmin(req, res);

    expect(result).toBeNull();
    expect(res._status).toBe(403);
  });

  it("returns 403 when user not found in database", async () => {
    getServerSession.mockResolvedValue(mockAuthSession());
    const usersCol = createMockCollection({ findOne: vi.fn().mockResolvedValue(null) });
    const db = createMockDb({ users: usersCol });
    connectToDatabase.mockResolvedValue({ db });

    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAdmin(req, res);

    expect(result).toBeNull();
    expect(res._status).toBe(403);
  });

  it("returns session and db when user is admin", async () => {
    const session = mockAuthSession();
    getServerSession.mockResolvedValue(session);
    const usersCol = createMockCollection({
      findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "admin" }),
    });
    const db = createMockDb({ users: usersCol });
    connectToDatabase.mockResolvedValue({ db });

    const req = createMockReq();
    const res = createMockRes();

    const result = await requireAdmin(req, res);

    expect(result).not.toBeNull();
    expect(result.session).toBe(session);
    expect(result.db).toBe(db);
  });
});
