import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./pool.js";

function setupAdminMocks({ poolByCity = [], coverageBuckets = [] } = {}) {
  getServerSession.mockResolvedValue(mockAuthSession({ role: "admin" }));

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "admin" }),
  });

  let callCount = 0;
  const imageCol = createMockCollection({
    aggregate: vi.fn().mockImplementation(() => ({
      toArray: vi.fn().mockResolvedValue(callCount++ === 0 ? poolByCity : coverageBuckets),
    })),
  });

  const db = createMockDb({
    users: usersCol,
    Image: imageCol,
  });

  connectToDatabase.mockResolvedValue({ db });
  return { db, imageCol };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/pool", () => {
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

  it("returns pool status for admin", async () => {
    setupAdminMocks({
      poolByCity: [
        { _id: { city: "Makati", poolStatus: "served" }, count: 200 },
        { _id: { city: "Makati", poolStatus: "reserve" }, count: 50 },
        { _id: { city: "Quezon City", poolStatus: "served" }, count: 30 },
      ],
      coverageBuckets: [
        { _id: 0, count: 100 },
        { _id: 1, count: 80 },
        { _id: 2, count: 50 },
        { _id: "3+", count: 20 },
      ],
    });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.cities).toHaveLength(2);
    expect(res._json.cities[0]).toEqual({ city: "Makati", served: 200, reserve: 50 });
    expect(res._json.coverage).toEqual({ "0": 100, "1": 80, "2": 50, "3+": 20 });
  });

  it("flags exhaustion warnings for cities with < 50 served images", async () => {
    setupAdminMocks({
      poolByCity: [
        { _id: { city: "Makati", poolStatus: "served" }, count: 200 },
        { _id: { city: "Taguig", poolStatus: "served" }, count: 10 },
      ],
    });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._json.exhaustionWarnings).toHaveLength(1);
    expect(res._json.exhaustionWarnings[0]).toEqual({ city: "Taguig", served: 10 });
  });
});
