import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./retraining.js";

function setupAdminMocks({ cycles = [], versionDist = [], totalImages = 0, annotationCount = 0 } = {}) {
  getServerSession.mockResolvedValue(mockAuthSession({ role: "admin" }));

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "admin" }),
  });

  const telemetryCol = createMockCollection({
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(cycles),
      }),
    }),
  });

  const imageCol = createMockCollection({
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(versionDist),
    }),
    countDocuments: vi.fn().mockResolvedValue(totalImages),
  });

  const annotationsCol = createMockCollection({
    countDocuments: vi.fn().mockResolvedValue(annotationCount),
  });

  const db = createMockDb({
    users: usersCol,
    telemetry_logs: telemetryCol,
    Image: imageCol,
    annotations: annotationsCol,
  });
  connectToDatabase.mockResolvedValue({ db });
  return { db };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/retraining", () => {
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

  it("returns empty state when no retraining has occurred", async () => {
    setupAdminMocks({ totalImages: 500, annotationCount: 1200 });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.cycleCount).toBe(0);
    expect(res._json.retrainingCycles).toEqual([]);
    expect(res._json.totalCompletedAnnotations).toBe(1200);
    expect(res._json.nextRetrainingAt).toBe(2000);
    expect(res._json.annotationsUntilNext).toBe(800);
  });

  it("returns retraining history and version distribution", async () => {
    const cycleDate = new Date("2026-09-15T10:00:00Z");
    setupAdminMocks({
      cycles: [{
        modelVersion: "v1-retrained",
        timestamp: cycleDate,
        predictionsInFile: 500,
        imagesUpdated: 480,
        imagesCleared: 5,
        imagesMissing: 15,
      }],
      versionDist: [
        { _id: "v1-retrained", count: 480 },
        { _id: "v0-mapillary", count: 20 },
      ],
      totalImages: 500,
      annotationCount: 3500,
    });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.cycleCount).toBe(1);
    expect(res._json.retrainingCycles[0].modelVersion).toBe("v1-retrained");
    expect(res._json.retrainingCycles[0].imagesUpdated).toBe(480);
    expect(res._json.versionDistribution).toHaveLength(2);
    expect(res._json.versionDistribution[0].version).toBe("v1-retrained");
    expect(res._json.totalImages).toBe(500);
    expect(res._json.totalCompletedAnnotations).toBe(3500);
    expect(res._json.nextRetrainingAt).toBe(4000);
    expect(res._json.annotationsUntilNext).toBe(500);
  });

  it("computes next milestone correctly at exact boundary", async () => {
    setupAdminMocks({ annotationCount: 4000 });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);

    expect(res._json.nextRetrainingAt).toBe(4000);
    expect(res._json.annotationsUntilNext).toBe(0);
  });

  it("returns 2000 as first milestone when no annotations exist", async () => {
    setupAdminMocks({ annotationCount: 0 });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);

    expect(res._json.nextRetrainingAt).toBe(2000);
    expect(res._json.annotationsUntilNext).toBe(2000);
  });
});
