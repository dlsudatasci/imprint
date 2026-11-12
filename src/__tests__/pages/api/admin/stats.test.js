import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "@/pages/api/admin/stats.js";

function setupAdminMocks({ sessions = [], annotators = [] } = {}) {
  getServerSession.mockResolvedValue(mockAuthSession({ role: "admin" }));

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "admin" }),
    // The annotator accounts (S22)
    find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(annotators) }),
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
    // The completed sessions the average duration reads (S22). The mock
    // ignores the query, so every session given comes back.
    find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(sessions) }),
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

  // S22 (9 Nov 2026): from the sessions collection, not SESSION_COMPLETE
  // telemetry, which nothing writes
  describe("average session duration (S22)", () => {
    const at = (minutes) => new Date(Date.UTC(2026, 10, 9, 8, minutes));
    const run = async (options) => {
      const mocks = setupAdminMocks(options);
      const res = createMockRes();
      await handler(createMockReq({ method: "GET" }), res);
      return { ...mocks, res };
    };

    it("averages contributors' completed sessions from start to completion", async () => {
      const annotator = new ObjectId();
      const { res, db, sessionsCol, telemetryCol } = await run({
        annotators: [{ _id: annotator }],
        sessions: [
          { userId: "u1", status: "completed", createdAt: at(0), completedAt: at(12) },
          { userId: "u2", status: "completed", createdAt: at(10), completedAt: at(28) },
          { userId: "u3", status: "abandoned", createdAt: at(0), completedAt: at(50) },
          { userId: annotator.toString(), status: "completed", createdAt: at(0), completedAt: at(55) },
        ],
      });
      expect(res._status).toBe(200);
      expect(res._json.avgSessionDurationMs).toBe(15 * 60_000);
      // Asked of the sessions collection, without the annotators
      expect(db.collection).toHaveBeenCalledWith("users");
      expect(sessionsCol.find).toHaveBeenCalledWith(
        { status: "completed", completedAt: { $exists: true }, userId: { $nin: [annotator.toString(), annotator] } },
        expect.objectContaining({ projection: expect.objectContaining({ createdAt: 1, completedAt: 1 }) })
      );
      // No SESSION_COMPLETE match is left
      for (const [pipeline] of telemetryCol.aggregate.mock.calls) {
        expect(JSON.stringify(pipeline)).not.toContain("SESSION_COMPLETE");
      }
    });

    it("is null, not 0, with no completed sessions", async () => {
      const { res } = await run({
        sessions: [{ userId: "u3", status: "abandoned", createdAt: at(0), completedAt: at(50) }],
      });
      expect(res._json.avgSessionDurationMs).toBeNull();
      const empty = await run();
      expect(empty.res._json.avgSessionDurationMs).toBeNull();
    });
  });
});
