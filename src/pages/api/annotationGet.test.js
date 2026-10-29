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
      // Confirmed address (S9), so the email gate stays open
      emailVerifiedAt: new Date("2026-10-01T00:00:00Z"),
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

// The annotator's model-development draw (S14, 28 Oct 2026): Image.find with a
// projection lists the candidates, annotations.aggregate counts the annotators'
// completed annotations, sessions.find lists other users' open sessions, and a
// second Image.find reads the chosen images in full.
function mockModelDevPool(mocks, { pool = [], done = [], openSessions = [] } = {}) {
  mocks.imageCol.find.mockImplementation((filter = {}, options = {}) => {
    const excluded = filter.imageID?.$nin || [];
    const wanted = filter._id?.$in?.map(String);
    const rows = options.projection
      ? pool.filter((img) => !excluded.includes(img.imageID)).map(({ _id, imageID }) => ({ _id, imageID }))
      : pool.filter((img) => wanted?.includes(String(img._id)));
    return { toArray: vi.fn().mockResolvedValue(rows) };
  });
  mocks.annotationsCol.aggregate.mockReturnValue({ toArray: vi.fn().mockResolvedValue(done) });
  mocks.sessionsCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue(openSessions) });
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

  it("fills the remainder with model-dev images, with no city shares, when reference images don't fill session", async () => {
    const mocks = setupMocks({ userRole: "annotator" });

    const refImages = Array.from({ length: 3 }, (_, i) => ({
      _id: `ref-${i}`,
      imageID: i + 1,
      isReference: true,
      poolStatus: "served",
      annotationList: [],
    }));
    const pool = Array.from({ length: 20 }, (_, i) => ({
      _id: `dev-${i}`,
      imageID: 100 + i,
      city: i < 15 ? "makati" : "manila",
      isReference: false,
      poolStatus: "model_dev",
      annotationList: [{ id: "pred-1" }],
    }));

    mocks.imageCol.aggregate
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(refImages) });
    mockModelDevPool(mocks, { pool });

    const req = createMockReq({ body: { annotationTotalCount: 10 } });
    const res = createMockRes();

    await handler(req, res);

    // Only the reference query is an aggregate on Image: no city counts
    expect(mocks.imageCol.aggregate).toHaveBeenCalledTimes(1);

    // The model-dev candidates exclude reference images
    const [candidateFilter] = mocks.imageCol.find.mock.calls.find((c) => c[1]?.projection);
    expect(candidateFilter.isReference).toEqual({ $ne: true });
    expect(candidateFilter.poolStatus).toBe("model_dev");

    expect(res._json.imgRecords).toHaveLength(10);
    expect(res._json.imgRecords.filter((img) => img.isReference)).toHaveLength(3);
    expect(res._json.imgRecords.filter((img) => img.poolStatus === "model_dev")).toHaveLength(7);
  });

  it("keeps the suggestions on reference and model-dev images in annotator sessions (decided 1 Oct 2026)", async () => {
    const mocks = setupMocks({ userRole: "annotator" });

    const refImages = [
      { _id: "ref-0", imageID: 1, isReference: true, poolStatus: "served", annotationList: [{ id: "pred-1" }] },
    ];
    const modelDevImages = [
      { _id: "dev-0", imageID: 2, isReference: false, poolStatus: "model_dev", city: "makati", annotationList: [{ id: "pred-2", comment: "tree" }] },
    ];

    mocks.imageCol.aggregate
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(refImages) });
    mockModelDevPool(mocks, { pool: modelDevImages });

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

    const modelDevImages = [
      { _id: "dev-0", imageID: 1, isReference: false, poolStatus: "model_dev", city: "makati", annotationList: originalAnnotations },
    ];

    mocks.imageCol.aggregate
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([]) });
    mockModelDevPool(mocks, { pool: modelDevImages });

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
        .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([refImg(0)]) });
      mockModelDevPool(mocks, { pool: [modelDevImg(0), deploymentImg(0), reserveImg(0), modelDevImg(1)] });
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

    // 22 Oct 2026: a contributor resuming sees their answer where it now is
    it("gives back a saved Step 2 answer on the new scale, marked, whichever it was answered on", async () => {
      const img = (i) => ({ _id: `img-${i}`, imageID: i, isReference: false, poolStatus: "deployment", annotationList: [] });
      const mocks = setupMocks({
        activeSession: { userId: MOCK_USER_ID, status: "active", imageIDs: ["img-1", "img-2"], completedImageIDs: [1, 2], totalCount: 10 },
      });
      mocks.imageCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([img(1), img(2)]) });
      mocks.annotationsCol.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          // Before the change: 1 was Easily accessible, Easy to traverse and Comfortable
          { imageID: 1, selectedObjectsID: [], newObjects: [], sceneLevel: { sidewalkWidth: "two_people", surfaceCondition: 1, walkability: 1, overallAccessibility: 1 } },
          { imageID: 2, selectedObjectsID: [], newObjects: [], sceneScale: 2, sceneLevel: { sidewalkWidth: "one_person", surfaceCondition: 2, walkability: 1, overallAccessibility: 4 } },
        ]),
      });
      const res = createMockRes();
      await handler(createMockReq({ body: {} }), res);

      const [first, second] = res._json.imgRecords;
      expect(first.userSceneLevel).toEqual({ sidewalkWidth: "two_people", surfaceCondition: 3, walkability: 3, overallAccessibility: 5 });
      expect(second.userSceneLevel).toEqual({ sidewalkWidth: "one_person", surfaceCondition: 2, walkability: 1, overallAccessibility: 4 });
      expect(first.userSceneScale).toBe(2);
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
      mocks.imageCol.aggregate.mockReturnValue({
        toArray: vi.fn().mockResolvedValue(Array.from({ length: 10 }, (_, i) => devImg(i))),
      });
      mockModelDevPool(mocks, { pool: Array.from({ length: 10 }, (_, i) => devImg(i)) });
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

// Email verification before annotation (S9, decided 21 Oct 2026)
// The suggestion threshold τ is a setting (S2, 29 Oct 2026)
describe("POST /api/annotationGet suggestion threshold", () => {
  function storeTau(mocks, value) {
    const settings = createMockCollection({
      findOne: vi.fn().mockResolvedValue(value === undefined ? null : { _id: "tau", value, modelVersion: "det-v1-rfdetr-small" }),
    });
    const others = mocks.db.collection.getMockImplementation();
    mocks.db.collection.mockImplementation((name) => (name === "settings" ? settings : others(name)));
    return settings;
  }
  function servePool(mocks) {
    mocks.imageCol.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: "dep-0", imageID: 500, city: "makati", isReference: false, poolStatus: "served", annotationList: [] }]),
    });
  }
  async function newSession(value) {
    const mocks = setupMocks({ userRole: "user" });
    const settings = storeTau(mocks, value);
    servePool(mocks);
    const res = createMockRes();
    await handler(createMockReq({ body: { annotationTotalCount: 5 } }), res);
    return { mocks, settings, res };
  }

  it("returns the stored τ with a new batch and keeps it on the session", async () => {
    const { mocks, settings, res } = await newSession(0.43);
    expect(settings.findOne).toHaveBeenCalledWith({ _id: "tau" });
    expect(res._json.tau).toBe(0.43);
    expect(mocks.sessionsCol.insertOne.mock.calls[0][0]).toMatchObject({ status: "active", tau: 0.43 });
  });

  it("falls back to 0.5 when no τ is stored", async () => {
    const { mocks, res } = await newSession(undefined);
    expect(res._json.tau).toBe(0.5);
    expect(mocks.sessionsCol.insertOne.mock.calls[0][0].tau).toBe(0.5);
  });

  it("gives a new session the new value once the stored τ changes, with no deploy", async () => {
    const first = await newSession(0.5);
    vi.clearAllMocks();
    const second = await newSession(0.38);
    expect(first.res._json.tau).toBe(0.5);
    expect(second.res._json.tau).toBe(0.38);
  });

  it("returns the τ an open session started with, even after the stored one changed", async () => {
    const mocks = setupMocks({
      activeSession: { userId: MOCK_USER_ID, status: "active", imageIDs: [], completedImageIDs: [], totalCount: 10, tau: 0.5 },
    });
    storeTau(mocks, 0.38);
    const res = createMockRes();
    await handler(createMockReq({ body: {} }), res);
    expect(res._json.isExistingSession).toBe(true);
    expect(res._json.tau).toBe(0.5);
  });

  it("returns the stored τ for an open session from before S2", async () => {
    const mocks = setupMocks({
      activeSession: { userId: MOCK_USER_ID, status: "active", imageIDs: [], completedImageIDs: [], totalCount: 10 },
    });
    storeTau(mocks, 0.38);
    const res = createMockRes();
    await handler(createMockReq({ body: {} }), res);
    expect(res._json.tau).toBe(0.38);
  });

  it("ignores a τ in the request", async () => {
    const mocks = setupMocks({ userRole: "user" });
    storeTau(mocks, 0.43);
    servePool(mocks);
    const res = createMockRes();
    await handler(createMockReq({ body: { annotationTotalCount: 5, tau: 0.1 } }), res);
    expect(res._json.tau).toBe(0.43);
    expect(mocks.sessionsCol.insertOne.mock.calls[0][0].tau).toBe(0.43);
  });
});

describe("POST /api/annotationGet email verification", () => {
  it("refuses a contributor whose address is not confirmed, for the check and for a new session", async () => {
    for (const body of [{}, { annotationTotalCount: 10 }]) {
      const mocks = setupMocks();
      mocks.usersCol.findOne.mockResolvedValue({ _id: MOCK_USER_ID, role: "user", emailVerifiedAt: null });
      const res = createMockRes();
      await handler(createMockReq({ body }), res);
      expect(res._status).toBe(403);
      expect(res._json.code).toBe("EMAIL_NOT_VERIFIED");
      expect(mocks.sessionsCol.findOne).not.toHaveBeenCalled();
      expect(mocks.sessionsCol.insertOne).not.toHaveBeenCalled();
    }
  });

  it("refuses an account from before S9 that the script has not marked yet", async () => {
    const mocks = setupMocks();
    mocks.usersCol.findOne.mockResolvedValue({ _id: MOCK_USER_ID, role: "user" });
    const res = createMockRes();
    await handler(createMockReq({ body: {} }), res);
    expect(res._status).toBe(403);
  });

  it("reads the database, not the sign-in, so a token claiming confirmation does not help", async () => {
    const mocks = setupMocks();
    getServerSession.mockResolvedValue(mockAuthSession({ _id: MOCK_USER_ID, needsEmailVerification: false, emailVerifiedAt: "2026-10-01" }));
    mocks.usersCol.findOne.mockResolvedValue({ _id: MOCK_USER_ID, role: "user", emailVerifiedAt: null });
    const res = createMockRes();
    await handler(createMockReq({ body: {} }), res);
    expect(res._status).toBe(403);
  });

  it("never refuses annotators or admins, confirmed or not", async () => {
    for (const role of ["annotator", "admin"]) {
      const mocks = setupMocks({ userRole: role });
      mocks.usersCol.findOne.mockResolvedValue({ _id: MOCK_USER_ID, role, emailVerifiedAt: null });
      const res = createMockRes();
      await handler(createMockReq({ body: {} }), res);
      expect(res._status).not.toBe(403);
      expect(res._json.sessionSizes).toBeDefined();
    }
  });

  it("lets a confirmed contributor through", async () => {
    setupMocks();
    const res = createMockRes();
    await handler(createMockReq({ body: {} }), res);
    expect(res._json.sessionSizes).toEqual([5, 10, 20, 40]);
  });
});

// Annotators get model-development images nobody has done, before any image
// twice (S14, 28 Oct 2026)
describe("POST /api/annotationGet annotator model-dev draw (S14)", () => {
  const OTHER_USER = "bbbbbbbbbbbbbbbbbbbbbbbb";
  let nextId = 0;
  const dev = (city, extra = {}) => {
    nextId++;
    return { _id: `dev-${nextId}`, imageID: 1000 + nextId, city, isReference: false, poolStatus: "model_dev", annotationList: [], ...extra };
  };
  const doneRows = (images, count) => images.map((img) => ({ _id: img.imageID, count }));
  const servedIds = (res) => res._json.imgRecords.map((img) => img._id).sort();
  const sorted = (images) => images.map((img) => img._id).sort();

  // No reference images left, so the whole session is model-dev
  async function startSession(size, poolSetup, { completed = [] } = {}) {
    const mocks = setupMocks({ userRole: "annotator" });
    mocks.annotationsCol.find.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValue(completed.map((img) => ({ imageID: img.imageID }))),
    });
    mockModelDevPool(mocks, poolSetup);
    const res = createMockRes();
    await handler(createMockReq({ body: { annotationTotalCount: size } }), res);
    return { mocks, res };
  }

  it("serves only untouched images while enough remain, none open elsewhere and none the annotator completed", async () => {
    const untouched = Array.from({ length: 12 }, () => dev("makati"));
    const doneByOthers = Array.from({ length: 10 }, () => dev("pasig"));
    const openElsewhere = Array.from({ length: 10 }, () => dev("makati"));
    const mine = Array.from({ length: 5 }, () => dev("makati"));
    const { res } = await startSession(10, {
      pool: [...doneByOthers, ...openElsewhere, ...mine, ...untouched],
      done: [...doneRows(doneByOthers, 1), ...doneRows(mine, 1)],
      openSessions: [{ imageIDs: openElsewhere.map((img) => img._id) }],
    }, { completed: mine });

    expect(res._json.imgRecords).toHaveLength(10);
    const allowed = new Set(untouched.map((img) => img._id));
    expect(res._json.imgRecords.every((img) => allowed.has(img._id))).toBe(true);
  });

  it("gives a finished city nothing while other cities have untouched images", async () => {
    const finished = ["pasig", "taguig", "navotas", "pateros"].flatMap((city) => Array.from({ length: 20 }, () => dev(city)));
    const waiting = ["las_pinas", "makati", "mandaluyong", "quezon_city"].flatMap((city) => Array.from({ length: 10 }, () => dev(city)));
    const { res } = await startSession(25, { pool: [...finished, ...waiting], done: doneRows(finished, 1) });

    expect(res._json.imgRecords).toHaveLength(25);
    expect(res._json.imgRecords.every((img) => ["las_pinas", "makati", "mandaluyong", "quezon_city"].includes(img.city))).toBe(true);
  });

  it("fills from images open elsewhere, then the least-done, when untouched images run short", async () => {
    const free = Array.from({ length: 3 }, () => dev("makati"));
    const open = Array.from({ length: 4 }, () => dev("makati"));
    const once = Array.from({ length: 2 }, () => dev("pasig"));
    const twice = Array.from({ length: 3 }, () => dev("pasig"));
    const thrice = Array.from({ length: 5 }, () => dev("pasig"));
    const { res } = await startSession(10, {
      pool: [...thrice, ...twice, ...once, ...open, ...free],
      done: [...doneRows(once, 1), ...doneRows(twice, 2), ...doneRows(thrice, 3)],
      openSessions: [{ imageIDs: open.map((img) => img._id) }],
    });

    const served = servedIds(res);
    expect(served).toHaveLength(10);
    for (const img of [...free, ...open, ...once]) expect(served).toContain(img._id);
    expect(served.filter((id) => twice.some((img) => img._id === id))).toHaveLength(1);
    expect(served.some((id) => thrice.some((img) => img._id === id))).toBe(false);
  });

  it("counts done from completed annotator annotations, not annotationCount, which lags behind open sessions", async () => {
    const countedButNotDone = Array.from({ length: 10 }, () => dev("makati", { annotationCount: 4 }));
    const doneButNotCounted = Array.from({ length: 10 }, () => dev("makati", { annotationCount: 0 }));
    const { mocks, res } = await startSession(10, {
      pool: [...doneButNotCounted, ...countedButNotDone],
      done: doneRows(doneButNotCounted, 1),
    });

    expect(servedIds(res)).toEqual(sorted(countedButNotDone));
    const pipeline = mocks.annotationsCol.aggregate.mock.calls[0][0];
    const match = pipeline.find((st) => st.$match).$match;
    expect(match.source).toBe("annotator");
    expect(match.status).toBe("completed");
    expect(match.imageID.$in).toHaveLength(20);
    expect(pipeline.find((st) => st.$group).$group._id).toBe("$imageID");
  });

  it("reads other users' active sessions as taken, never the annotator's own", async () => {
    const { mocks } = await startSession(10, { pool: [dev("makati")] });
    const [filter] = mocks.sessionsCol.find.mock.calls[0];
    expect(filter).toEqual({ status: "active", userId: { $ne: MOCK_USER_ID } });
  });

  it("matches open sessions by Image _id, whether stored as ObjectId or string", async () => {
    const free = Array.from({ length: 10 }, () => dev("makati"));
    const open = Array.from({ length: 10 }, () => dev("makati"));
    const { res } = await startSession(10, {
      pool: [...open, ...free],
      openSessions: [
        { userId: OTHER_USER, imageIDs: open.slice(0, 5).map((img) => ({ toString: () => img._id })) },
        { userId: OTHER_USER, imageIDs: open.slice(5).map((img) => img._id) },
      ],
    });
    expect(servedIds(res)).toEqual(sorted(free));
  });

  it("asks the database to leave out images the annotator completed", async () => {
    const mine = [dev("makati"), dev("makati")];
    const rest = Array.from({ length: 10 }, () => dev("makati"));
    const { mocks, res } = await startSession(10, { pool: [...mine, ...rest] }, { completed: mine });

    const [candidateFilter] = mocks.imageCol.find.mock.calls.find((c) => c[1]?.projection);
    expect(candidateFilter.imageID.$nin).toEqual(mine.map((img) => img.imageID));
    expect(servedIds(res)).toEqual(sorted(rest));
  });

  it("serves what remains when fewer images are left than asked, for the session size asked", async () => {
    const left = [dev("makati"), dev("pasig")];
    const { mocks, res } = await startSession(25, { pool: left, done: doneRows(left.slice(1), 2) });

    expect(servedIds(res)).toEqual(sorted(left));
    const inserted = mocks.sessionsCol.insertOne.mock.calls[0][0];
    expect(inserted.imageIDs).toHaveLength(2);
    expect(inserted.totalCount).toBe(25);
  });

  it("reports pool exhaustion when nothing is left, without counting annotations", async () => {
    const { mocks, res } = await startSession(10, { pool: [] });
    expect(res._json.poolExhausted).toBe(true);
    expect(mocks.sessionsCol.insertOne).not.toHaveBeenCalled();
    expect(mocks.annotationsCol.aggregate).not.toHaveBeenCalled();
  });

  it("puts reference images first and draws model-dev images only for the rest", async () => {
    const mocks = setupMocks({ userRole: "annotator" });
    const refs = Array.from({ length: 4 }, (_, i) => ({ _id: `ref-${i}`, imageID: i + 1, isReference: true, poolStatus: "served", annotationList: [] }));
    mocks.imageCol.aggregate.mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(refs) });
    const pool = Array.from({ length: 20 }, () => dev("makati"));
    mockModelDevPool(mocks, { pool });
    const res = createMockRes();
    await handler(createMockReq({ body: { annotationTotalCount: 10 } }), res);

    expect(res._json.imgRecords).toHaveLength(10);
    expect(res._json.imgRecords.filter((img) => img.isReference)).toHaveLength(4);
    const fullRead = mocks.imageCol.find.mock.calls.find((c) => !c[1]?.projection);
    expect(fullRead[0]._id.$in).toHaveLength(6);
  });

  it("does not run the model-dev draw when reference images fill the session", async () => {
    const mocks = setupMocks({ userRole: "annotator" });
    const refs = Array.from({ length: 10 }, (_, i) => ({ _id: `ref-${i}`, imageID: i + 1, isReference: true, poolStatus: "served", annotationList: [] }));
    mocks.imageCol.aggregate.mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(refs) });
    mockModelDevPool(mocks, { pool: [dev("makati")] });
    await handler(createMockReq({ body: { annotationTotalCount: 10 } }), createMockRes());

    expect(mocks.imageCol.find).not.toHaveBeenCalled();
    expect(mocks.annotationsCol.aggregate).not.toHaveBeenCalled();
    expect(mocks.sessionsCol.find).not.toHaveBeenCalled();
  });

  it("leaves the contributor draw as it was", async () => {
    const mocks = setupMocks({ userRole: "user" });
    await handler(createMockReq({ body: { annotationTotalCount: 10 } }), createMockRes());

    expect(mocks.imageCol.find).not.toHaveBeenCalled();
    expect(mocks.annotationsCol.aggregate).not.toHaveBeenCalled();
    expect(mocks.sessionsCol.find).not.toHaveBeenCalled();
  });
});
