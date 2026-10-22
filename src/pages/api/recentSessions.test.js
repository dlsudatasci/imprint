import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockDb, createMockCollection, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./recentSessions.js";

function setupMocks({ hasSession = true, completedSessions = [], activeSession = null, userRole = "user" } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession({ _id: MOCK_USER_ID }) : null
  );

  // Honours skip and limit, as the database does, so paging can be tested
  const cursor = { skipBy: 0, limitTo: Infinity };
  const chain = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn((n) => { cursor.skipBy = n; return chain; }),
    limit: vi.fn((n) => { cursor.limitTo = n; return chain; }),
    toArray: vi.fn(async () => completedSessions.slice(cursor.skipBy, cursor.skipBy + cursor.limitTo)),
  };
  const sessionsCol = {
    find: vi.fn(() => { cursor.skipBy = 0; cursor.limitTo = Infinity; return chain; }),
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

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ role: userRole }),
  });

  const db = createMockDb({});
  db.collection = vi.fn((name) => {
    if (name === "users") return usersCol;
    if (name === "sessions") return sessionsCol;
    if (name === "annotations") return annotationsCol;
    if (name === "Image") return imageCol;
    return createMockCollection();
  });
  connectToDatabase.mockResolvedValue({ db });
  return { db, sessionsCol, annotationsCol, usersCol, imageCol, chain };
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

    // 17 Oct 2026 (IMPRINT_dashboard_audit.md)
    it("charts obstructions only and names the city as people write it", async () => {
      const { annotationsCol } = setupMocks({ completedSessions: completed });
      annotationsCol.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            imageID: 1, city: "quezoncity",
            selectedObjectsID: [{ obstructs: true, comment: "tree" }, { obstructs: false, comment: "car" }, { obstructs: false, comment: "not_an_object" }],
            newObjects: [{ obstructs: true, comment: "motorcycle" }],
          },
          { imageID: 2, city: "quezoncity", selectedObjectsID: [{ obstructs: false, comment: "tree" }], newObjects: [] },
        ]),
      });
      const res = createMockRes();
      await handler(createMockReq({ method: "GET" }), res);

      expect(res._json.sessions[0].chartData).toEqual([2, 0]);
      expect(res._json.sessions[0].location).toBe("Quezon City");
    });

    it("still averages contributors' accessibility answers", async () => {
      const { annotationsCol } = setupMocks({ completedSessions: completed });
      annotationsCol.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { imageID: 1, sceneScale: 2, sceneLevel: { sidewalkWidth: "two_people", overallAccessibility: 2 } },
          { imageID: 2, sceneScale: 2, sceneLevel: { sidewalkWidth: "two_people", overallAccessibility: 5 } },
        ]),
      });
      const res = createMockRes();
      await handler(createMockReq({ method: "GET" }), res);

      expect(res._json.sessions[0].averageScore).toBe("3.5");
    });

    // 22 Oct 2026: 5 is Easily accessible. An answer from before has no sceneScale and ran the other way
    it("turns answers from before 22 Oct 2026 round, so 5 is Easily accessible either way", async () => {
      const { annotationsCol } = setupMocks({ completedSessions: completed });
      annotationsCol.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          // Old scale: 1 was Easily accessible, so this is a 5
          { imageID: 1, sceneLevel: { sidewalkWidth: "two_people", overallAccessibility: 1 } },
          { imageID: 2, sceneScale: 2, sceneLevel: { sidewalkWidth: "two_people", overallAccessibility: 4 } },
        ]),
      });
      const res = createMockRes();
      await handler(createMockReq({ method: "GET" }), res);

      expect(res._json.sessions[0].averageScore).toBe("4.5");
    });

    it("no longer averages in the fields from before sceneLevel", async () => {
      const { annotationsCol } = setupMocks({ completedSessions: completed });
      annotationsCol.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { imageID: 1, accessibilityRating: 8 },
          { imageID: 2, sceneRatings: { accessibility: 3 } },
        ]),
      });
      const res = createMockRes();
      await handler(createMockReq({ method: "GET" }), res);

      expect(res._json.sessions[0].averageScore).toBeNull();
    });
  });

  // 22 Oct 2026: five at a time, the cities named, every photo charted, five thumbnails
  describe("paging, places, the chart and the thumbnails", () => {
    const finished = (n) => Array.from({ length: n }, (_, i) => ({
      _id: `s${i + 1}`, userId: MOCK_USER_ID, status: "completed", completedImageIDs: [i * 10 + 1], completedAt: new Date(), createdAt: new Date(),
    }));
    const active = { _id: "active-1", userId: MOCK_USER_ID, status: "active", imageIDs: [1, 2], completedImageIDs: [], totalCount: 2, currentCount: 1, createdAt: new Date() };

    it("sends the newest five and says there are more, then the next five", async () => {
      const { chain } = setupMocks({ completedSessions: finished(12) });
      let res = createMockRes();
      await handler(createMockReq({ method: "GET" }), res);
      expect(res._json.sessions.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
      expect(res._json.hasMore).toBe(true);
      // One more than the page is asked for, to know
      expect(chain.limit).toHaveBeenLastCalledWith(6);

      res = createMockRes();
      await handler(createMockReq({ method: "GET", query: { offset: "10", limit: "5" } }), res);
      expect(res._json.sessions.map((s) => s.id)).toEqual(["s11", "s12"]);
      expect(res._json.hasMore).toBe(false);
      expect(chain.skip).toHaveBeenLastCalledWith(10);
    });

    it("puts the active session first on the first page only, not counted in the five", async () => {
      setupMocks({ completedSessions: finished(6), activeSession: active });
      let res = createMockRes();
      await handler(createMockReq({ method: "GET" }), res);
      expect(res._json.sessions[0].isActive).toBe(true);
      expect(res._json.sessions.filter((s) => !s.isActive)).toHaveLength(5);
      res = createMockRes();
      await handler(createMockReq({ method: "GET", query: { offset: "5" } }), res);
      expect(res._json.sessions.some((s) => s.isActive)).toBe(false);
      expect(res._json.sessions.map((s) => s.id)).toEqual(["s6"]);
    });

    it("shows the active session even before any session is finished", async () => {
      setupMocks({ completedSessions: [], activeSession: active });
      const res = createMockRes();
      await handler(createMockReq({ method: "GET" }), res);
      expect(res._json.sessions).toHaveLength(1);
      expect(res._json.sessions[0].isActive).toBe(true);
      expect(res._json.hasMore).toBe(false);
    });

    it("names the cities, most photos first, charts every photo, and sends five thumbnails", async () => {
      const ids = [1, 2, 3, 4, 5, 6, 7];
      const { annotationsCol, imageCol } = setupMocks({
        completedSessions: [{ _id: "s1", userId: MOCK_USER_ID, status: "completed", completedImageIDs: ids, completedAt: new Date(), createdAt: new Date() }],
      });
      const cities = ["sanjuan", "makati", "makati", "pasig", "makati", "sanjuan", "quezoncity"];
      annotationsCol.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue(ids.map((id, i) => ({
          imageID: id, city: cities[i], selectedObjectsID: Array.from({ length: i % 3 }, () => ({ obstructs: true, comment: "tree" })), newObjects: [],
        }))),
      });
      imageCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue(ids.map((id) => ({ _id: `img${id}`, imageID: id, url: `/p${id}.jpg` }))) });
      const res = createMockRes();
      await handler(createMockReq({ method: "GET" }), res);
      const row = res._json.sessions[0];
      expect(row.location).toBe("Makati, San Juan and 2 more");
      expect(row.cities).toEqual(["Makati", "San Juan", "Pasig", "Quezon City"]);
      // Seven photos, seven counts, not averaged into five
      expect(row.chartData).toEqual([0, 1, 2, 0, 1, 2, 0]);
      expect(row.imageUrls).toEqual(["/p1.jpg", "/p2.jpg", "/p3.jpg", "/p4.jpg", "/p5.jpg"]);
    });
  });

  // Annotators see their Recent sessions again (21 Oct 2026; none from 4 Oct)
  it("returns an annotator's sessions too", async () => {
    const { sessionsCol } = setupMocks({
      userRole: "annotator",
      completedSessions: [{ _id: "s1", userId: MOCK_USER_ID, status: "completed", completedImageIDs: [1], createdAt: new Date() }],
    });
    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);

    expect(res._status).toBe(200);
    expect(sessionsCol.find).toHaveBeenCalled();
    expect(res._json.sessions).toHaveLength(1);
  });
});
