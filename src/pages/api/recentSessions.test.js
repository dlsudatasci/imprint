import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockDb, createMockCollection, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./recentSessions.js";

function setupMocks({ hasSession = true, completedSessions = [], activeSession = null } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession({ _id: MOCK_USER_ID }) : null
  );

  const sessionsCol = {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue(completedSessions),
    }),
    findOne: vi.fn().mockResolvedValue(activeSession),
  };

  const annotationsCol = {
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
  };

  const imageCol = {
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
  };

  const db = createMockDb({});
  db.collection = vi.fn((name) => {
    if (name === "sessions") return sessionsCol;
    if (name === "annotations") return annotationsCol;
    if (name === "Image") return imageCol;
    return createMockCollection();
  });
  connectToDatabase.mockResolvedValue({ db });
  return { db, sessionsCol, annotationsCol };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("GET /api/recentSessions", () => {
  it("returns empty sessions when none exist", async () => {
    setupMocks();
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.sessions).toEqual([]);
  });

  it("returns completed sessions with expected shape", async () => {
    const sessions = [{
      _id: "session-1",
      userId: MOCK_USER_ID,
      status: "completed",
      completedImageIDs: [1, 2],
      completedAt: new Date(),
      createdAt: new Date(),
    }];
    setupMocks({ completedSessions: sessions });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.sessions).toHaveLength(1);
    expect(res._json.sessions[0]).toHaveProperty("id");
    expect(res._json.sessions[0]).toHaveProperty("totalImages", 2);
    expect(res._json.sessions[0]).toHaveProperty("chartData");
  });

  it("prepends active session when one exists alongside completed", async () => {
    const completedSessions = [{
      _id: "session-done",
      userId: MOCK_USER_ID,
      status: "completed",
      completedImageIDs: [1],
      completedAt: new Date(),
      createdAt: new Date(),
    }];
    const activeSession = {
      _id: "active-1",
      userId: MOCK_USER_ID,
      status: "active",
      imageIDs: [10, 11, 12],
      completedImageIDs: [10],
      totalCount: 3,
      currentCount: 2,
      createdAt: new Date(),
    };
    setupMocks({ completedSessions, activeSession });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._json.sessions[0].isActive).toBe(true);
    expect(res._json.sessions.length).toBeGreaterThan(1);
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 405 for disallowed methods", async () => {
    const req = createMockReq({ method: "DELETE" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it("accepts POST method", async () => {
    setupMocks();
    const req = createMockReq({ method: "POST" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
  });

  describe("averageScore", () => {
    const completed = [{
      _id: "session-1",
      userId: MOCK_USER_ID,
      status: "completed",
      completedImageIDs: [1, 2],
      completedAt: new Date(),
      createdAt: new Date(),
    }];

    it("is null when no annotation in the session has an accessibility answer (annotators, 3 Oct 2026)", async () => {
      const { annotationsCol } = setupMocks({ completedSessions: completed });
      annotationsCol.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { imageID: 1, source: "annotator", sceneLevel: null, selectedObjectsID: [], newObjects: [] },
          { imageID: 2, source: "annotator", sceneLevel: null, selectedObjectsID: [], newObjects: [] },
        ]),
      });
      const res = createMockRes();
      await handler(createMockReq({ method: "GET" }), res);

      expect(res._json.sessions[0].averageScore).toBeNull();
    });

    it("still averages contributors' accessibility answers", async () => {
      const { annotationsCol } = setupMocks({ completedSessions: completed });
      annotationsCol.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { imageID: 1, sceneLevel: { sidewalkWidth: "two_people", overallAccessibility: 2 } },
          { imageID: 2, sceneLevel: { sidewalkWidth: "two_people", overallAccessibility: 5 } },
        ]),
      });
      const res = createMockRes();
      await handler(createMockReq({ method: "GET" }), res);

      expect(res._json.sessions[0].averageScore).toBe("3.5");
    });
  });
});
