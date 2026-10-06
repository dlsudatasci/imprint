import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
    expect(res._json.sessionSizes).toEqual([5, 10, 20, 40]);
  });

  it("tells an annotator their own session sizes when no session is active", async () => {
    setupMocks({ userRole: "annotator" });
    const res = createMockRes();
    await handler(createMockReq({ body: {} }), res);
    expect(res._json.sessionSizes).toEqual([10, 25, 50]);
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
    const mockImages = [{ _id: "img-1", imageID: 1, isReference: false, poolStatus: "served", annotationList: [] }];
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
    const mockImages = [{ _id: "img-1", imageID: 1, isReference: false, poolStatus: "served", annotationList: [] }];
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
      poolStatus: "served",
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
      poolStatus: "served",
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
      poolStatus: "served",
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
      poolStatus: "model_dev",
      annotationList: [{ id: "pred-1" }],
    }));

    const manilaImages = Array.from({ length: 2 }, (_, i) => ({
      _id: `manila-${i}`,
      imageID: 200 + i,
      city: "manila",
      isReference: false,
      poolStatus: "model_dev",
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
    expect(cityDistMatch.$match.poolStatus).toBe("model_dev");

    // So do the per-city batches
    for (const call of mocks.imageCol.aggregate.mock.calls.slice(2)) {
      const m = call[0].find((st) => st.$match).$match;
      expect(m.poolStatus).toBe("model_dev");
      expect(m.isReference).toEqual({ $ne: true });
    }

    expect(res._json.imgRecords).toHaveLength(10);
  });

  it("keeps the suggestions on reference and model-dev images in annotator sessions (decided 1 Oct 2026)", async () => {
    const mocks = setupMocks({ userRole: "annotator" });

    const refImages = [
      { _id: "ref-0", imageID: 1, isReference: true, poolStatus: "served", annotationList: [{ id: "pred-1" }] },
    ];
    const cityDist = [{ _id: "makati", count: 10 }];
    const modelDevImages = [
      { _id: "dev-0", imageID: 2, isReference: false, poolStatus: "model_dev", city: "makati", annotationList: [{ id: "pred-2", comment: "tree" }] },
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

    expect(refResult.annotationList).toEqual([{ id: "pred-1" }]);
    expect(devResult.annotationList).toEqual([{ id: "pred-2", comment: "tree" }]);
  });

  it("keeps the suggestions on reference images when an annotator resumes a session", async () => {
    const ref = { _id: "ref-0", imageID: 1, isReference: true, poolStatus: "served", annotationList: [{ id: "pred-1", comment: "car" }] };
    const mocks = setupMocks({
      userRole: "annotator",
      activeSession: { userId: MOCK_USER_ID, status: "active", imageIDs: ["ref-0"], completedImageIDs: [], totalCount: 10 },
    });
    mocks.imageCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([ref]) });
    const res = createMockRes();
    await handler(createMockReq({ body: {} }), res);
    expect(res._json.isExistingSession).toBe(true);
    expect(res._json.imgRecords[0].annotationList).toEqual([{ id: "pred-1", comment: "car" }]);
  });

  it("preserves pre-populated annotations for model-dev images in annotator sessions", async () => {
    const mocks = setupMocks({ userRole: "annotator" });

    const originalAnnotations = [
      { id: "pred-1", comment: "tree", mark: { x: 10, y: 20, width: 50, height: 60 } },
      { id: "pred-2", comment: "bollard", mark: { x: 100, y: 200, width: 30, height: 40 } },
    ];

    const cityDist = [{ _id: "makati", count: 5 }];
    const modelDevImages = [
      { _id: "dev-0", imageID: 1, isReference: false, poolStatus: "model_dev", city: "makati", annotationList: originalAnnotations },
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

  describe("pool separation (Step 5)", () => {
    const deploymentImg = (i) => ({ _id: `dep-${i}`, imageID: 500 + i, city: "makati", isReference: false, poolStatus: "served", annotationList: [] });
    const modelDevImg = (i) => ({ _id: `dev-${i}`, imageID: 900 + i, city: "makati", isReference: false, poolStatus: "model_dev", annotationList: [] });
    const reserveImg = (i) => ({ _id: `res-${i}`, imageID: 1200 + i, city: "makati", isReference: false, poolStatus: "reserve", annotationList: [] });
    const refImg = (i) => ({ _id: `ref-${i}`, imageID: 1 + i, isReference: true, poolStatus: "served", annotationList: [] });

    it("contributor queries match only served deployment images and served reference images", async () => {
      const mocks = setupMocks();
      await handler(createMockReq({ body: { annotationTotalCount: 10 } }), createMockRes());

      const matches = mocks.imageCol.aggregate.mock.calls.map((c) => c[0].find((st) => st.$match).$match);
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        expect(m.poolStatus).toBe("served");
        expect([true, false]).toContain(m.isReference);
      }
    });

    it("a contributor session never contains a model-dev or reserve image, even if a query returned one", async () => {
      const mocks = setupMocks();
      mocks.imageCol.aggregate
        .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([refImg(0)]) })
        .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([deploymentImg(0), modelDevImg(0), reserveImg(0), deploymentImg(1)]) });
      const res = createMockRes();
      await handler(createMockReq({ body: { annotationTotalCount: 5 } }), res);

      const served = res._json.imgRecords;
      expect(served.map((i) => i._id).sort()).toEqual(["dep-0", "dep-1", "ref-0"]);
      expect(served.some((i) => i.poolStatus === "model_dev" || i.poolStatus === "reserve")).toBe(false);
      const inserted = mocks.sessionsCol.insertOne.mock.calls[0][0].imageIDs;
      expect(inserted).not.toContain("dev-0");
      expect(inserted).not.toContain("res-0");
    });

    it("reports pool exhaustion rather than serving model-dev images to a contributor", async () => {
      const mocks = setupMocks();
      mocks.imageCol.aggregate.mockReturnValue({ toArray: vi.fn().mockResolvedValue([modelDevImg(0), modelDevImg(1)]) });
      const res = createMockRes();
      await handler(createMockReq({ body: { annotationTotalCount: 5 } }), res);

      expect(res._json.poolExhausted).toBe(true);
      expect(mocks.sessionsCol.insertOne).not.toHaveBeenCalled();
    });

    it("an annotator session never contains a deployment or reserve image, even if a query returned one", async () => {
      const mocks = setupMocks({ userRole: "annotator" });
      mocks.imageCol.aggregate
        .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([refImg(0)]) })
        .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([{ _id: "makati", count: 9 }]) })
        .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([modelDevImg(0), deploymentImg(0), reserveImg(0), modelDevImg(1)]) });
      const res = createMockRes();
      await handler(createMockReq({ body: { annotationTotalCount: 10 } }), res);

      const served = res._json.imgRecords;
      expect(served.map((i) => i._id).sort()).toEqual(["dev-0", "dev-1", "ref-0"]);
      expect(served.some((i) => i.poolStatus === "served" && i.isReference === false)).toBe(false);
      expect(served.some((i) => i.poolStatus === "reserve")).toBe(false);
    });
  });

  describe("reference rate (one in eight over the whole participation)", () => {
    function refQueryLimit(mocks) {
      const refCall = mocks.imageCol.aggregate.mock.calls.find(
        (c) => c[0].find((st) => st.$match).$match.isReference === true
      );
      return refCall ? refCall[0].find((st) => st.$limit).$limit : 0;
    }

    it("asks for round(size / 8) reference images in a first session", async () => {
      const mocks = setupMocks();
      await handler(createMockReq({ body: { annotationTotalCount: 20 } }), createMockRes());
      expect(refQueryLimit(mocks)).toBe(3);
    });

    it("counts every image served in earlier sessions", async () => {
      const mocks = setupMocks();
      mocks.sessionsCol.aggregate.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ _id: null, served: 20 }]) });
      await handler(createMockReq({ body: { annotationTotalCount: 40 } }), createMockRes());
      // round(60/8) - round(20/8) = 8 - 3 = 5
      expect(refQueryLimit(mocks)).toBe(5);
      const priorPipeline = mocks.sessionsCol.aggregate.mock.calls[0][0];
      expect(priorPipeline[0]).toEqual({ $match: { userId: MOCK_USER_ID } });
    });

    it("skips the reference query when the session is owed none", async () => {
      const mocks = setupMocks();
      mocks.sessionsCol.aggregate.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ _id: null, served: 5 }]) });
      mocks.imageCol.aggregate.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([0, 1, 2, 3, 4].map((i) => ({ _id: `dep-${i}`, imageID: 500 + i, city: "makati", isReference: false, poolStatus: "served", annotationList: [] }))),
      });
      const res = createMockRes();
      await handler(createMockReq({ body: { annotationTotalCount: 5 } }), res);

      expect(refQueryLimit(mocks)).toBe(0);
      for (const c of mocks.imageCol.aggregate.mock.calls) {
        const limit = c[0].find((st) => st.$limit);
        if (limit) expect(limit.$limit).toBeGreaterThan(0);
      }
      expect(res._json.imgRecords).toHaveLength(5);
    });
  });

  // The annotation tool hides the scene step and severity for annotators
  // (3 Oct 2026), so every successful response says which role this is
  describe("isAnnotator in every successful response", () => {
    const roles = [["annotator", true], ["user", false]];

    it.each(roles)("existing session: role %s gives isAnnotator %s", async (role, expected) => {
      setupMocks({
        userRole: role,
        activeSession: { userId: MOCK_USER_ID, status: "active", imageIDs: [], completedImageIDs: [], totalCount: 10 },
      });
      const res = createMockRes();
      await handler(createMockReq({ body: {} }), res);

      expect(res._json.isExistingSession).toBe(true);
      expect(res._json.isAnnotator).toBe(expected);
    });

    it.each(roles)("no count given: role %s gives isAnnotator %s", async (role, expected) => {
      setupMocks({ userRole: role });
      const res = createMockRes();
      await handler(createMockReq({ body: {} }), res);

      expect(res._json.sessionSizes).toBeDefined();
      expect(res._json.isAnnotator).toBe(expected);
    });

    it.each(roles)("pool exhausted: role %s gives isAnnotator %s", async (role, expected) => {
      const mocks = setupMocks({ userRole: role });
      mocks.imageCol.aggregate.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
      const res = createMockRes();
      await handler(createMockReq({ body: { annotationTotalCount: role === "annotator" ? 10 : 5 } }), res);

      expect(res._json.poolExhausted).toBe(true);
      expect(res._json.isAnnotator).toBe(expected);
    });

    it("new session: an annotator gets isAnnotator true", async () => {
      const mocks = setupMocks({ userRole: "annotator" });
      const refImages = Array.from({ length: 10 }, (_, i) => ({
        _id: `ref-${i}`, imageID: i + 1, isReference: true, poolStatus: "served", annotationList: [],
      }));
      mocks.imageCol.aggregate.mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(refImages) });
      const res = createMockRes();
      await handler(createMockReq({ body: { annotationTotalCount: 10 } }), res);

      expect(res._json.isExistingSession).toBe(false);
      expect(res._json.imgRecords).toHaveLength(10);
      expect(res._json.isAnnotator).toBe(true);
    });

    it("new session: a contributor gets isAnnotator false", async () => {
      const mocks = setupMocks({ userRole: "user" });
      mocks.imageCol.aggregate.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{ _id: "dep-0", imageID: 500, city: "makati", isReference: false, poolStatus: "served", annotationList: [] }]),
      });
      const res = createMockRes();
      await handler(createMockReq({ body: { annotationTotalCount: 5 } }), res);

      expect(res._json.isExistingSession).toBe(false);
      expect(res._json.imgRecords.length).toBeGreaterThan(0);
      expect(res._json.isAnnotator).toBe(false);
    });
  });

  // Reference answers never leave the server (6 Oct 2026, both roles), and the
  // annotator's sidewalk outline comes back for Previous and resumed sessions
  describe("what the browser receives", () => {
    const answerKey = [{ userId: "a1", source: "annotator", selectedObjectsID: [], newObjects: [{ id: "n1", obstructs: true }] }];

    it("strips referenceGroundTruth from a resumed session", async () => {
      const ref = { _id: "ref-0", imageID: 1, isReference: true, poolStatus: "served", annotationList: [], referenceGroundTruth: answerKey };
      const mocks = setupMocks({
        userRole: "user",
        activeSession: { userId: MOCK_USER_ID, status: "active", imageIDs: ["ref-0"], completedImageIDs: [], totalCount: 5 },
      });
      mocks.imageCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([ref]) });
      const res = createMockRes();
      await handler(createMockReq({ body: {} }), res);

      expect(res._json.imgRecords).toHaveLength(1);
      expect(res._json.imgRecords[0]).not.toHaveProperty("referenceGroundTruth");
      expect(res._json.imgRecords[0].imageID).toBe(1);
    });

    it("strips referenceGroundTruth from a new session", async () => {
      const mocks = setupMocks({ userRole: "annotator" });
      const refImages = Array.from({ length: 10 }, (_, i) => ({
        _id: `ref-${i}`, imageID: i + 1, isReference: true, poolStatus: "served", annotationList: [], referenceGroundTruth: answerKey,
      }));
      mocks.imageCol.aggregate.mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(refImages) });
      const res = createMockRes();
      await handler(createMockReq({ body: { annotationTotalCount: 10 } }), res);

      expect(res._json.imgRecords).toHaveLength(10);
      for (const img of res._json.imgRecords) expect(img).not.toHaveProperty("referenceGroundTruth");
    });

    // Guard: the browser needs sidewalkAgreement to ask for the outline on the
    // flagged reference images (6 Oct 2026)
    it("keeps sidewalkAgreement on images in resumed and new sessions", async () => {
      const ref = { _id: "ref-0", imageID: 1, isReference: true, poolStatus: "served", sidewalkAgreement: true, annotationList: [], referenceGroundTruth: answerKey };
      const resumed = setupMocks({
        userRole: "annotator",
        activeSession: { userId: MOCK_USER_ID, status: "active", imageIDs: ["ref-0"], completedImageIDs: [], totalCount: 10 },
      });
      resumed.imageCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([ref]) });
      const res1 = createMockRes();
      await handler(createMockReq({ body: {} }), res1);
      expect(res1._json.imgRecords[0].sidewalkAgreement).toBe(true);

      const fresh = setupMocks({ userRole: "annotator" });
      const refImages = Array.from({ length: 10 }, (_, i) => ({ ...ref, _id: `ref-${i}`, imageID: i + 1 }));
      fresh.imageCol.aggregate.mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(refImages) });
      const res2 = createMockRes();
      await handler(createMockReq({ body: { annotationTotalCount: 10 } }), res2);
      expect(res2._json.imgRecords).toHaveLength(10);
      for (const img of res2._json.imgRecords) expect(img.sidewalkAgreement).toBe(true);
    });

    it("copies the stored sidewalk outline into userSidewalkMask", async () => {
      const dev = { _id: "dev-0", imageID: 3, isReference: false, poolStatus: "model_dev", annotationList: [] };
      const mask = { noSidewalk: false, polygons: [{ id: "w1", kind: "walk", points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 0, y: 9 }] }] };
      const mocks = setupMocks({
        userRole: "annotator",
        activeSession: { userId: MOCK_USER_ID, status: "active", imageIDs: ["dev-0"], completedImageIDs: [3], totalCount: 10 },
      });
      mocks.imageCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([dev]) });
      mocks.annotationsCol.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{ imageID: 3, selectedObjectsID: [], newObjects: [], sceneLevel: null, sidewalkMask: mask }]),
      });
      const res = createMockRes();
      await handler(createMockReq({ body: {} }), res);

      expect(res._json.imgRecords[0].userSidewalkMask).toEqual(mask);
    });
  });

  // Local testing only (6 Oct 2026): ANNOTATOR_MODEL_DEV_FIRST=true
  describe("ANNOTATOR_MODEL_DEV_FIRST", () => {
    const saved = process.env.ANNOTATOR_MODEL_DEV_FIRST;
    const devImg = (i) => ({ _id: `dev-${i}`, imageID: 900 + i, city: "makati", isReference: false, poolStatus: "model_dev", annotationList: [] });
    const hasReferenceQuery = (mocks) =>
      mocks.imageCol.aggregate.mock.calls.some((c) => c[0].some((st) => st.$match && st.$match.isReference === true));

    function setupModelDevSession(role) {
      const mocks = setupMocks({ userRole: role });
      mocks.imageCol.aggregate.mockImplementation((pipeline) => {
        const group = pipeline.find((st) => st.$group);
        const rows = group ? [{ _id: "makati", count: 50 }] : Array.from({ length: 10 }, (_, i) => devImg(i));
        return { toArray: vi.fn().mockResolvedValue(rows) };
      });
      return mocks;
    }

    afterEach(() => {
      if (saved === undefined) delete process.env.ANNOTATOR_MODEL_DEV_FIRST;
      else process.env.ANNOTATOR_MODEL_DEV_FIRST = saved;
    });

    it("skips the reference images for an annotator when on", async () => {
      process.env.ANNOTATOR_MODEL_DEV_FIRST = "true";
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const mocks = setupModelDevSession("annotator");
      const res = createMockRes();
      await handler(createMockReq({ body: { annotationTotalCount: 10 } }), res);
      warn.mockRestore();

      expect(hasReferenceQuery(mocks)).toBe(false);
      expect(res._json.imgRecords).toHaveLength(10);
      expect(res._json.imgRecords.every((img) => img.poolStatus === "model_dev")).toBe(true);
    });

    it("still draws reference images first when off", async () => {
      delete process.env.ANNOTATOR_MODEL_DEV_FIRST;
      const mocks = setupModelDevSession("annotator");
      await handler(createMockReq({ body: { annotationTotalCount: 10 } }), createMockRes());

      expect(hasReferenceQuery(mocks)).toBe(true);
      expect(mocks.imageCol.aggregate.mock.calls[0][0][0].$match.isReference).toBe(true);
    });

    it("does not change contributor sessions", async () => {
      process.env.ANNOTATOR_MODEL_DEV_FIRST = "true";
      const mocks = setupMocks({ userRole: "user" });
      await handler(createMockReq({ body: { annotationTotalCount: 5 } }), createMockRes());

      const matches = mocks.imageCol.aggregate.mock.calls.map((c) => c[0].find((st) => st.$match).$match);
      expect(matches.some((m) => m.isReference === true)).toBe(true);
      expect(matches.every((m) => m.poolStatus === "served")).toBe(true);
    });
  });
});
