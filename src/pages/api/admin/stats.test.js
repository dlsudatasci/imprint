import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./stats.js";

function setupAdminMocks() {
  getServerSession.mockResolvedValue(mockAuthSession({ role: "admin" }));

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "admin" }),
  });

  const annotationsCol = createMockCollection({
    countDocuments: vi.fn().mockResolvedValue(500),
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: null, users: ["u1", "u2", "u3"] }]),
    }),
  });

  const sessionsCol = createMockCollection({
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { _id: "completed", count: 80 },
        { _id: "abandoned", count: 15 },
        { _id: "active", count: 5 },
      ]),
    }),
  });

  const telemetryCol = createMockCollection({
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
  });

  const db = createMockDb({
    users: usersCol,
    annotations: annotationsCol,
    sessions: sessionsCol,
    telemetry_logs: telemetryCol,
  });

  connectToDatabase.mockResolvedValue({ db });
  return { db, annotationsCol, sessionsCol, telemetryCol };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/stats", () => {
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

  it("returns overview stats for admin", async () => {
    setupAdminMocks();
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toHaveProperty("totalContributors");
    expect(res._json).toHaveProperty("totalAnnotations", 500);
    expect(res._json).toHaveProperty("annotationsToday");
    expect(res._json).toHaveProperty("activeContributorsToday");
    expect(res._json).toHaveProperty("completionRate");
    expect(res._json).toHaveProperty("abandonmentRate");
    expect(res._json).toHaveProperty("totalSessions", 100);
    expect(res._json).toHaveProperty("modelVersions");
  });

  it("computes session health rates correctly", async () => {
    setupAdminMocks();
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._json.completionRate).toBe(80);
    expect(res._json.abandonmentRate).toBe(15);
  });
});
