import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./degenerate.js";

const FLAGGED_USER = "cccccccccccccccccccccccc";

function setupAdminMocks({ contributors = [], annotations = [], telemetry = [], userDocs = [] } = {}) {
  getServerSession.mockResolvedValue(mockAuthSession({ role: "admin" }));

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "admin" }),
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(userDocs),
    }),
  });

  const annotationsCol = createMockCollection({
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(contributors),
    }),
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(annotations),
    }),
  });

  const telemetryCol = createMockCollection({
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(telemetry),
    }),
  });

  const db = createMockDb({
    users: usersCol,
    annotations: annotationsCol,
    telemetry_logs: telemetryCol,
  });
  connectToDatabase.mockResolvedValue({ db });
  return { db, annotationsCol };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/quality/degenerate", () => {
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

  it("returns empty when no contributors have 10+ annotations", async () => {
    setupAdminMocks({ contributors: [] });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.flaggedContributors).toEqual([]);
    expect(res._json.scannedCount).toBe(0);
  });

  it("flags a degenerate contributor", async () => {
    const degenerateAnnotations = Array.from({ length: 12 }, (_, i) => ({
      userId: FLAGGED_USER,
      imageID: `img${i}`,
      status: "completed",
      selectedObjectsID: [{ obstructs: true, severity: 3 }],
      newObjects: [],
      sceneLevel: { sidewalkWidth: "two_people", surfaceCondition: 2, walkability: 3, overallAccessibility: 3 },
    }));

    setupAdminMocks({
      contributors: [{ _id: FLAGGED_USER, count: 12 }],
      annotations: degenerateAnnotations,
      telemetry: Array.from({ length: 12 }, () => ({
        userId: FLAGGED_USER,
        event: "IMAGE_SUBMITTED",
        imageDurationMs: 2000,
      })),
      userDocs: [{ _id: new ObjectId(FLAGGED_USER), username: "sus_user" }],
    });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.scannedCount).toBe(1);
    expect(res._json.flaggedContributors).toHaveLength(1);
    expect(res._json.flaggedContributors[0].flags.length).toBeGreaterThan(0);
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

  // These screens are contributor quality control, so annotators are left out
  // of both queries (3 Oct 2026)
  it("excludes annotator annotations from the aggregation and from the find", async () => {
    const { annotationsCol } = setupAdminMocks({ contributors: [{ _id: FLAGGED_USER, count: 12 }] });
    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);

    expect(res._status).toBe(200);
    const [pipeline] = annotationsCol.aggregate.mock.calls[0];
    expect(pipeline[0].$match).toEqual({ status: "completed", source: { $ne: "annotator" } });
    const [filter] = annotationsCol.find.mock.calls[0];
    expect(filter.source).toEqual({ $ne: "annotator" });
    expect(filter.status).toBe("completed");
  });
});
