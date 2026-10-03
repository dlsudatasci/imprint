import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./reference-performance.js";

const USER_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const USER_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

function setupAdminMocks({
  refImages = [],
  annotations = [],
  userDocs = [],
} = {}) {
  getServerSession.mockResolvedValue(mockAuthSession({ role: "admin" }));

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "admin" }),
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(userDocs),
    }),
  });

  const imageCol = createMockCollection({
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(refImages),
    }),
  });

  const annotationsCol = createMockCollection({
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(annotations),
    }),
  });

  const db = createMockDb({
    users: usersCol,
    Image: imageCol,
    annotations: annotationsCol,
  });
  connectToDatabase.mockResolvedValue({ db });
  return { db };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/quality/reference-performance", () => {
  it("returns 405 for non-GET", async () => {
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

  it("returns empty when no reference images exist", async () => {
    setupAdminMocks({ refImages: [] });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.contributors).toEqual([]);
    expect(res._json.referenceImageCount).toBe(0);
  });

  it("computes scores when reference data exists", async () => {
    setupAdminMocks({
      refImages: [{
        imageID: "img1",
        referenceGroundTruth: [{
          userId: USER_B,
          source: "annotator",
          sceneLevel: { sidewalkWidth: "two_people", surfaceCondition: 2, walkability: 3, overallAccessibility: 3 },
          selectedObjectsID: [{ mark: { x: 0, y: 0, width: 100, height: 100 }, comment: "tree", obstructs: true, severity: 3 }],
          newObjects: [],
        }],
      }],
      annotations: [{
        imageID: "img1",
        userId: USER_A,
        source: "contributor",
        status: "completed",
        sceneLevel: { sidewalkWidth: "two_people", surfaceCondition: 2, walkability: 3, overallAccessibility: 3 },
        selectedObjectsID: [{ mark: { x: 0, y: 0, width: 100, height: 100 }, comment: "tree", obstructs: true, severity: 4 }],
        newObjects: [],
      }],
      userDocs: [{ _id: new ObjectId(USER_A), username: "alice" }],
    });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.contributors).toHaveLength(1);
    expect(res._json.contributors[0].avgF1).toBe(1);
    expect(res._json.contributors[0].avgObstructionAgreement).toBe(1);
    // Annotators record neither severity nor scene answers (3 Oct 2026)
    expect(res._json.contributors[0]).not.toHaveProperty("avgSeverityMAE");
    expect(res._json.contributors[0]).not.toHaveProperty("avgSceneAgreement");
  });

  it("scores against the answer key merged from every annotator, not the first annotator only (2 Oct 2026)", async () => {
    const b = (x, comment) => ({ mark: { x, y: 0, width: 100, height: 100 }, comment, obstructs: false });
    const entry = (userId, boxes, submittedAt = "2026-10-02T00:00:00Z") => ({
      userId, source: "annotator", submittedAt, sceneLevel: null, selectedObjectsID: [], newObjects: boxes,
    });
    setupAdminMocks({
      refImages: [{
        imageID: "img1",
        referenceGroundTruth: [
          entry("ann1", []), // the first annotator missed the bench
          entry("ann2", [b(0, "bench")]),
          entry("ann3", [b(5, "bench")]),
          { userId: USER_B, source: "contributor", sceneLevel: null, selectedObjectsID: [], newObjects: [] },
        ],
      }],
      annotations: [{
        imageID: "img1", userId: USER_A, source: "contributor", status: "completed",
        sceneLevel: null, selectedObjectsID: [], newObjects: [b(0, "bench")],
      }],
      userDocs: [{ _id: new ObjectId(USER_A), username: "alice" }],
    });
    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res._status).toBe(200);
    expect(res._json.contributors[0].avgF1).toBe(1);
    expect(res._json.answerKey).toEqual({ objects: 1, uncertain: 0, categoryTies: 0, annotatorsPerImage: { min: 3, max: 3 } });
  });

  it("returns 403 for non-admin", async () => {
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
});
