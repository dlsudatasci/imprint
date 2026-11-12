import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "@/pages/api/admin/quality/degenerate.js";

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
      sceneLevel: { sidewalkWidth: "two_people", overallAccessibility: 3, surfaceEvenness: 3, surfaceType: "concrete", surfaceCondition: 2, roadBarrier: false },
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

// S20 (7 Nov 2026): a photo sent again is IMAGE_RESUBMITTED, which this check does not read
describe("GET /api/admin/quality/degenerate with photos sent again", () => {
  it("does not flag as impossibly fast a contributor whose photos each have one normal send and one short resend", async () => {
    const annotations = Array.from({ length: 12 }, (_, i) => ({
      userId: FLAGGED_USER,
      imageID: `img${i}`,
      status: "completed",
      selectedObjectsID: [{ obstructs: i % 2 === 0, severity: i % 2 === 0 ? (i % 5) + 1 : null }],
      newObjects: [],
      sceneLevel: { sidewalkWidth: i % 2 ? "two_people" : "one_person", overallAccessibility: 3, surfaceEvenness: 3, surfaceType: "tiles", surfaceCondition: (i % 3) + 1, roadBarrier: true },
    }));
    const telemetry = Array.from({ length: 12 }, (_, i) => [
      { userId: FLAGGED_USER, event: "IMAGE_SUBMITTED", imageID: `img${i}`, imageDurationMs: 8000 },
      { userId: FLAGGED_USER, event: "IMAGE_RESUBMITTED", imageID: `img${i}`, imageDurationMs: 500 },
    ]).flat();
    setupAdminMocks({
      contributors: [{ _id: FLAGGED_USER, count: 12 }],
      annotations,
      userDocs: [{ _id: new ObjectId(FLAGGED_USER), username: "careful_user" }],
    });
    // The collection answers the query as MongoDB would: only the event asked for
    const { db } = await import("@/util/mongodb").then((m) => m.connectToDatabase());
    const find = vi.fn((query) => ({ toArray: vi.fn().mockResolvedValue(telemetry.filter((e) => e.event === query.event)) }));
    db.collection("telemetry_logs").find = find;

    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ event: "IMAGE_SUBMITTED" }));
    expect(res._status).toBe(200);
    expect(res._json.flaggedContributors).toEqual([]);
    // Both events together would have been a mean of 4250 ms, under the 5000 ms threshold
    expect((8000 + 500) / 2).toBeLessThan(5000);
  });
});
