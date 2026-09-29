import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("@/util/telemetryLogger", () => ({ logTelemetryEvent: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import handler from "./annotationGet.js";

function setupMocks({ hasSession = true, userRole = "user", activeSession = null, telemetryOverrides = {} } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession({ _id: MOCK_USER_ID }) : null
  );

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({
      _id: MOCK_USER_ID,
      role: userRole,
      frequentlyWalkedCities: ["Makati"],
    }),
  });

  const sessionsCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue(activeSession),
    insertOne: vi.fn().mockResolvedValue({ insertedId: "session-1" }),
    countDocuments: vi.fn().mockResolvedValue(0),
  });

  const imageCol = createMockCollection();
  const annotationsCol = createMockCollection();

  const telemetryCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue(null),
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
    ...telemetryOverrides,
  });

  const db = createMockDb({
    users: usersCol,
    sessions: sessionsCol,
    Image: imageCol,
    annotations: annotationsCol,
    telemetry_logs: telemetryCol,
  });

  connectToDatabase.mockResolvedValue({ db });
  return { db, usersCol, sessionsCol, imageCol, annotationsCol, telemetryCol };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/annotationGet", () => {
  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(401);
  });

  it("returns 405 for non-POST methods", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(405);
  });

  it("returns existing session when one is active", async () => {
    const existingSession = {
      userId: MOCK_USER_ID,
      status: "active",
      imageIDs: [],
      completedImageIDs: [],
      totalCount: 10,
    };
    setupMocks({ activeSession: existingSession });
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res._json.isExistingSession).toBe(true);
  });

  it("returns empty records with no active session and no count", async () => {
    setupMocks();
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res._json.imgRecords).toEqual([]);
  });

  it("returns 400 for invalid session size", async () => {
    setupMocks();
    const req = createMockReq({ body: { annotationTotalCount: 15 } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json.message).toContain("Invalid session size");
  });

  it("returns 404 when user not found", async () => {
    const mocks = setupMocks();
    mocks.usersCol.findOne.mockResolvedValue(null);
    const req = createMockReq({ body: { annotationTotalCount: 10 } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(404);
  });

  it("accepts annotator session sizes for annotators", async () => {
    setupMocks({ userRole: "annotator" });
    const req = createMockReq({ body: { annotationTotalCount: 50 } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).not.toBe(400);
  });

  it("rejects contributor session sizes not in the allowed set", async () => {
    setupMocks({ userRole: "user" });
    const req = createMockReq({ body: { annotationTotalCount: 50 } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(400);
  });

  it("includes session-level stats in SESSION_START for a new session", async () => {
    const mocks = setupMocks();
    const mockImages = [{ _id: "img-1", imageID: 1, annotationList: [] }];
    mocks.imageCol.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(mockImages),
    });
    mocks.sessionsCol.countDocuments.mockResolvedValue(4);
    mocks.telemetryCol.findOne.mockResolvedValue({
      timestamp: new Date(Date.now() - 86400000),
    });
    mocks.telemetryCol.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ count: 3 }]),
    });

    const req = createMockReq({ body: { annotationTotalCount: 5 } });
    const res = createMockRes();

    await handler(req, res);

    expect(logTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "SESSION_START",
        cumulativeSessionsToDate: 4,
        sessionPositionInHistory: 5,
        distinctActiveDays: 3,
      })
    );

    const call = logTelemetryEvent.mock.calls[0][0];
    expect(call.intervalSincePreviousSessionMs).toBeGreaterThan(0);
  });

  it("sorts images by annotationCount ascending in aggregate pipeline", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: { annotationTotalCount: 5 } });
    const res = createMockRes();

    await handler(req, res);

    const aggregateCalls = mocks.imageCol.aggregate.mock.calls;
    expect(aggregateCalls.length).toBeGreaterThan(0);

    for (const [pipeline] of aggregateCalls) {
      const sortStage = pipeline.find((s) => s.$sort);
      expect(sortStage.$sort).toHaveProperty("annotationCount", 1);
      expect(sortStage.$sort).toHaveProperty("rand", 1);

      const addFieldsStage = pipeline.find((s) => s.$addFields);
      expect(addFieldsStage.$addFields).toHaveProperty("annotationCount");
    }
  });

  it("returns poolExhausted when no images are available", async () => {
    const mocks = setupMocks();
    mocks.imageCol.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
    const req = createMockReq({ body: { annotationTotalCount: 5 } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._json).toHaveProperty("poolExhausted", true);
    expect(res._json.imgRecords).toEqual([]);
    expect(mocks.sessionsCol.insertOne).not.toHaveBeenCalled();
  });

  it("logs POOL_EXHAUSTION telemetry when pool is empty", async () => {
    const mocks = setupMocks();
    mocks.imageCol.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
    const req = createMockReq({ body: { annotationTotalCount: 5 } });
    const res = createMockRes();

    await handler(req, res);

    expect(logTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "POOL_EXHAUSTION",
        userId: MOCK_USER_ID,
        requestedCount: 5,
        availableImages: 0,
      })
    );
  });

  it("sets intervalSincePreviousSessionMs to null for first session", async () => {
    const mocks = setupMocks();
    const mockImages = [{ _id: "img-1", imageID: 1, annotationList: [] }];
    mocks.imageCol.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(mockImages),
    });
    mocks.sessionsCol.countDocuments.mockResolvedValue(0);
    mocks.telemetryCol.findOne.mockResolvedValue(null);

    const req = createMockReq({ body: { annotationTotalCount: 5 } });
    const res = createMockRes();

    await handler(req, res);

    expect(logTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "SESSION_START",
        cumulativeSessionsToDate: 0,
        sessionPositionInHistory: 1,
        distinctActiveDays: 0,
        intervalSincePreviousSessionMs: null,
      })
    );
  });

  it("prioritizes reference images in annotator sessions", async () => {
    const mocks = setupMocks({ userRole: "annotator" });

    const refImages = Array.from({ length: 10 }, (_, i) => ({
      _id: `ref-${i}`,
      imageID: i + 1,
      isReference: true,
      annotationList: [{ id: "box-1" }],
    }));

    mocks.imageCol.aggregate
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(refImages) });

    const req = createMockReq({ body: { annotationTotalCount: 10 } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._json.imgRecords).toHaveLength(10);

    // First aggregate call queries reference images
    const firstPipeline = mocks.imageCol.aggregate.mock.calls[0][0];
    const matchStage = firstPipeline.find((s) => s.$match);
    expect(matchStage.$match.isReference).toBe(true);
  });

  it("serves only reference images when enough remain to fill session", async () => {
    const mocks = setupMocks({ userRole: "annotator" });

    const refImages = Array.from({ length: 50 }, (_, i) => ({
      _id: `ref-${i}`,
      imageID: i + 1,
      isReference: true,
      annotationList: [],
    }));

    mocks.imageCol.aggregate
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(refImages) });

    const req = createMockReq({ body: { annotationTotalCount: 50 } });
    const res = createMockRes();

    await handler(req, res);

    // Only 1 aggregate call (reference query), no city-proportional fallback
    expect(mocks.imageCol.aggregate).toHaveBeenCalledTimes(1);
    expect(res._json.imgRecords).toHaveLength(50);
  });

  it("fills remainder with city-proportional model-dev images when reference images don't fill session", async () => {
    const mocks = setupMocks({ userRole: "annotator" });

    const refImages = Array.from({ length: 3 }, (_, i) => ({
      _id: `ref-${i}`,
      imageID: i + 1,
      isReference: true,
      annotationList: [],
    }));

    const cityDist = [
      { _id: "makati", count: 20 },
      { _id: "manila", count: 10 },
    ];

    const makatiImages = Array.from({ length: 5 }, (_, i) => ({
      _id: `makati-${i}`,
      imageID: 100 + i,
      city: "makati",
      isReference: false,
      annotationList: [{ id: "pred-1" }],
    }));

    const manilaImages = Array.from({ length: 2 }, (_, i) => ({
      _id: `manila-${i}`,
      imageID: 200 + i,
      city: "manila",
      isReference: false,
      annotationList: [{ id: "pred-2" }],
    }));

    mocks.imageCol.aggregate
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(refImages) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(cityDist) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(makatiImages) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(manilaImages) });

    const req = createMockReq({ body: { annotationTotalCount: 10 } });
    const res = createMockRes();

    await handler(req, res);

    // 4 aggregate calls: reference + city dist + 2 city batches
    expect(mocks.imageCol.aggregate).toHaveBeenCalledTimes(4);

    // City-dist query excludes reference images
    const cityDistPipeline = mocks.imageCol.aggregate.mock.calls[1][0];
    const cityDistMatch = cityDistPipeline.find((s) => s.$match);
    expect(cityDistMatch.$match.isReference).toEqual({ $ne: true });

    expect(res._json.imgRecords).toHaveLength(10);
  });

  it("clears annotationList only for reference images in annotator sessions", async () => {
    const mocks = setupMocks({ userRole: "annotator" });

    const refImages = [
      { _id: "ref-0", imageID: 1, isReference: true, annotationList: [{ id: "pred-1" }] },
    ];
    const cityDist = [{ _id: "makati", count: 10 }];
    const modelDevImages = [
      { _id: "dev-0", imageID: 2, isReference: false, city: "makati", annotationList: [{ id: "pred-2", comment: "tree" }] },
    ];

    mocks.imageCol.aggregate
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(refImages) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(cityDist) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(modelDevImages) });

    const req = createMockReq({ body: { annotationTotalCount: 10 } });
    const res = createMockRes();

    await handler(req, res);

    const refResult = res._json.imgRecords.find((img) => img.isReference);
    const devResult = res._json.imgRecords.find((img) => !img.isReference);

    expect(refResult.annotationList).toEqual([]);
    expect(devResult.annotationList).toEqual([{ id: "pred-2", comment: "tree" }]);
  });

  it("preserves pre-populated annotations for model-dev images in annotator sessions", async () => {
    const mocks = setupMocks({ userRole: "annotator" });

    const originalAnnotations = [
      { id: "pred-1", comment: "tree", mark: { x: 10, y: 20, width: 50, height: 60 } },
      { id: "pred-2", comment: "bollard", mark: { x: 100, y: 200, width: 30, height: 40 } },
    ];

    const cityDist = [{ _id: "makati", count: 5 }];
    const modelDevImages = [
      { _id: "dev-0", imageID: 1, isReference: false, city: "makati", annotationList: originalAnnotations },
    ];

    mocks.imageCol.aggregate
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([]) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(cityDist) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(modelDevImages) });

    const req = createMockReq({ body: { annotationTotalCount: 10 } });
    const res = createMockRes();

    await handler(req, res);

    const devImg = res._json.imgRecords.find((img) => img.imageID === 1);
    expect(devImg.annotationList).toEqual(originalAnnotations);
  });

});
