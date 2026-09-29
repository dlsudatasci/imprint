import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./agreement.js";

const USER_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const USER_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

function setupAdminMocks({ sharedImages = [], annotations = [], userDocs = [] } = {}) {
  getServerSession.mockResolvedValue(mockAuthSession({ role: "admin" }));

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "admin" }),
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(userDocs),
    }),
  });

  const annotationsCol = createMockCollection({
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(sharedImages),
    }),
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(annotations),
    }),
  });

  const db = createMockDb({
    users: usersCol,
    annotations: annotationsCol,
  });
  connectToDatabase.mockResolvedValue({ db });
  return { db };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/quality/agreement", () => {
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

  it("returns empty when no shared images exist", async () => {
    setupAdminMocks({ sharedImages: [] });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.sharedImageCount).toBe(0);
    expect(res._json.pairs).toEqual([]);
  });

  it("computes pairwise agreement for shared images", async () => {
    const scene = { sidewalkPresent: "yes", surfaceCondition: 2, walkability: 4, overallAccessibility: 3 };

    setupAdminMocks({
      sharedImages: [{ _id: "img1", users: [USER_A, USER_B], count: 2 }],
      annotations: [
        {
          imageID: "img1", userId: USER_A, source: "contributor", status: "completed",
          selectedObjectsID: [{ mark: { x: 0, y: 0, width: 100, height: 100 }, obstructs: true }],
          newObjects: [], sceneLevel: scene,
        },
        {
          imageID: "img1", userId: USER_B, source: "contributor", status: "completed",
          selectedObjectsID: [{ mark: { x: 5, y: 5, width: 100, height: 100 }, obstructs: true }],
          newObjects: [], sceneLevel: scene,
        },
      ],
      userDocs: [
        { _id: new ObjectId(USER_A), username: "alice" },
        { _id: new ObjectId(USER_B), username: "bob" },
      ],
    });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.sharedImageCount).toBe(1);
    expect(res._json.pairCount).toBe(1);
    expect(res._json.pairs[0].avgF1).toBeGreaterThan(0);
    expect(res._json.pairs[0].avgObstructionAgreement).toBe(1);
    expect(res._json.pairs[0].avgSceneAgreement).toBe(1);
    expect(res._json.summary).not.toBeNull();
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
