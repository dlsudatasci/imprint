import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("@/util/telemetryLogger", () => ({ logTelemetryEvent: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./annotationComplete.js";

function setupMocks({ hasSession = true } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession({ _id: MOCK_USER_ID }) : null
  );

  const annotationsCol = createMockCollection({
    countDocuments: vi.fn()
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(10),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 5 }),
  });

  const sessionsCol = createMockCollection({
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    findOne: vi.fn().mockResolvedValue({
      _id: new ObjectId("cccccccccccccccccccccccc"),
      userId: MOCK_USER_ID,
      completedAt: new Date(),
      imageIDs: [],
      completedImageIDs: [],
    }),
    countDocuments: vi.fn().mockResolvedValue(1),
  });

  const usersCol = createMockCollection();
  const imageCol = createMockCollection({
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
  });

  const db = createMockDb({
    annotations: annotationsCol,
    sessions: sessionsCol,
    users: usersCol,
    Image: imageCol,
  });

  connectToDatabase.mockResolvedValue({ db });
  return { db, annotationsCol, sessionsCol, usersCol, imageCol };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/annotationComplete", () => {
  it("copies only annotators' answers onto reference images (1 Oct 2026)", async () => {
    const m = setupMocks();
    m.sessionsCol.findOne.mockResolvedValue({
      _id: new ObjectId("cccccccccccccccccccccccc"),
      userId: MOCK_USER_ID,
      completedAt: new Date(),
      imageIDs: ["ref-oid"],
      completedImageIDs: [7],
    });
    m.imageCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ _id: "ref-oid", imageID: 7 }]) });
    const ann = { imageID: 7, source: "annotator", sceneLevel: { walkability: 3 }, selectedObjectsID: [{ id: "s1", obstructs: false }], newObjects: [] };
    m.annotationsCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([ann]) });
    m.imageCol.bulkWrite = vi.fn().mockResolvedValue({});

    const res = createMockRes();
    await handler(createMockReq({ body: { total: 10 } }), res);

    expect(res._status).toBe(200);
    expect(m.annotationsCol.find.mock.calls[0][0]).toEqual({ userId: MOCK_USER_ID, imageID: { $in: [7] }, source: "annotator" });
    const [op] = m.imageCol.bulkWrite.mock.calls[0][0];
    expect(op.updateOne.filter).toEqual({ imageID: 7 });
    expect(op.updateOne.update.$push.referenceGroundTruth).toMatchObject({ userId: MOCK_USER_ID, source: "annotator", selectedObjectsID: ann.selectedObjectsID });
  });

  // Guard: the outline on a flagged reference image stays in the annotations
  // collection and never enters the contributors' answer key (6 Oct 2026)
  it("leaves the sidewalk outline out of the referenceGroundTruth entry", async () => {
    const m = setupMocks();
    m.sessionsCol.findOne.mockResolvedValue({
      _id: new ObjectId("cccccccccccccccccccccccc"),
      userId: MOCK_USER_ID,
      completedAt: new Date(),
      imageIDs: ["ref-oid"],
      completedImageIDs: [7],
    });
    m.imageCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ _id: "ref-oid", imageID: 7, sidewalkAgreement: true }]) });
    const ann = { imageID: 7, source: "annotator", sceneLevel: null, selectedObjectsID: [], newObjects: [], sidewalkMask: { noSidewalk: false, polygons: [{ id: "w1", kind: "walk", points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 0, y: 9 }] }] } };
    m.annotationsCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([ann]) });
    m.imageCol.bulkWrite = vi.fn().mockResolvedValue({});

    await handler(createMockReq({ body: { total: 10 } }), createMockRes());

    const [op] = m.imageCol.bulkWrite.mock.calls[0][0];
    expect(op.updateOne.update.$push.referenceGroundTruth).not.toHaveProperty("sidewalkMask");
  });

  // Photo frame fix (9 Oct 2026): reference answers carry the canvas marker
  // so the analysis corrects only the ones drawn on the old, offset canvas
  it("carries canvasVersion into the referenceGroundTruth entry only when the annotation has it", async () => {
    const pushed = async (extra) => {
      vi.clearAllMocks();
      const m = setupMocks();
      m.sessionsCol.findOne.mockResolvedValue({
        _id: new ObjectId("cccccccccccccccccccccccc"),
        userId: MOCK_USER_ID,
        completedAt: new Date(),
        imageIDs: ["ref-oid"],
        completedImageIDs: [7],
      });
      m.imageCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ _id: "ref-oid", imageID: 7 }]) });
      const ann = { imageID: 7, source: "annotator", sceneLevel: null, selectedObjectsID: [], newObjects: [], ...extra };
      m.annotationsCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([ann]) });
      m.imageCol.bulkWrite = vi.fn().mockResolvedValue({});
      await handler(createMockReq({ body: { total: 10 } }), createMockRes());
      return m.imageCol.bulkWrite.mock.calls[0][0][0].updateOne.update.$push.referenceGroundTruth;
    };
    expect((await pushed({ canvasVersion: 2 })).canvasVersion).toBe(2);
    expect(await pushed({})).not.toHaveProperty("canvasVersion");
  });

  it("writes nothing onto a reference image when a contributor finishes a session", async () => {
    const m = setupMocks();
    m.sessionsCol.findOne.mockResolvedValue({
      _id: new ObjectId("cccccccccccccccccccccccc"),
      userId: MOCK_USER_ID,
      completedAt: new Date(),
      imageIDs: ["ref-oid"],
      completedImageIDs: [7],
    });
    m.imageCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ _id: "ref-oid", imageID: 7 }]) });
    // The source filter excludes the contributor's row, so the query returns nothing.
    m.annotationsCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
    m.imageCol.bulkWrite = vi.fn().mockResolvedValue({});

    const res = createMockRes();
    await handler(createMockReq({ body: { total: 10 } }), res);

    expect(res._status).toBe(200);
    expect(m.annotationsCol.find.mock.calls[0][0].source).toBe("annotator");
    expect(m.imageCol.bulkWrite).not.toHaveBeenCalled();
  });

  it("returns 200 with previousTotal and newTotal", async () => {
    setupMocks();
    const req = createMockReq({ body: { total: 10 } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toHaveProperty("previousTotal", 5);
    expect(res._json).toHaveProperty("newTotal", 10);
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ body: { total: 10 } });
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

  it("promotes pending annotations to completed", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: { total: 10 } });
    const res = createMockRes();

    await handler(req, res);

    expect(mocks.annotationsCol.updateMany).toHaveBeenCalledWith(
      { userId: MOCK_USER_ID, status: "pending" },
      { $set: { status: "completed" } }
    );
  });

  it("increments annotationCount on session images", async () => {
    const mocks = setupMocks();
    const sessionImageIDs = ["img-id-1", "img-id-2", "img-id-3"];
    mocks.sessionsCol.findOne.mockResolvedValue({
      userId: MOCK_USER_ID,
      completedAt: new Date(),
      imageIDs: sessionImageIDs,
    });
    const req = createMockReq({ body: { total: 10 } });
    const res = createMockRes();

    await handler(req, res);

    expect(mocks.imageCol.updateMany).toHaveBeenCalledWith(
      { _id: { $in: sessionImageIDs } },
      { $inc: { annotationCount: 1 } }
    );
  });

  it("skips annotationCount increment when session has no images", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: { total: 10 } });
    const res = createMockRes();

    await handler(req, res);

    expect(mocks.imageCol.updateMany).not.toHaveBeenCalledWith(
      expect.anything(),
      { $inc: { annotationCount: 1 } }
    );
  });

  it("marks session as completed", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: { total: 10 } });
    const res = createMockRes();

    await handler(req, res);

    expect(mocks.sessionsCol.updateOne).toHaveBeenCalledWith(
      { userId: MOCK_USER_ID, status: "active" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "completed" }) })
    );
  });

  it("includes sessionNumber in response", async () => {
    const mocks = setupMocks();
    mocks.sessionsCol.countDocuments.mockResolvedValue(3);
    const req = createMockReq({ body: { total: 10 } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._json).toHaveProperty("sessionNumber", 3);
  });

  it("includes shouldShowNasaTlx true for session 1", async () => {
    const mocks = setupMocks();
    mocks.sessionsCol.countDocuments.mockResolvedValue(1);
    const req = createMockReq({ body: { total: 10 } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._json).toHaveProperty("shouldShowNasaTlx", true);
  });

  it("includes shouldShowNasaTlx false for session 2", async () => {
    const mocks = setupMocks();
    mocks.sessionsCol.countDocuments.mockResolvedValue(2);
    const req = createMockReq({ body: { total: 10 } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._json).toHaveProperty("shouldShowNasaTlx", false);
  });

  it("includes sessionId from completed session", async () => {
    setupMocks();
    const req = createMockReq({ body: { total: 10 } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._json).toHaveProperty("sessionId", "cccccccccccccccccccccccc");
  });

  // Annotators are not prompted for the NASA-TLX (3 Oct 2026)
  describe("NASA-TLX prompt by role", () => {
    it("does not prompt an annotator after session 1, and still reports the session number", async () => {
      const mocks = setupMocks();
      mocks.sessionsCol.countDocuments.mockResolvedValue(1);
      mocks.usersCol.findOne.mockResolvedValue({ role: "annotator" });
      const res = createMockRes();

      await handler(createMockReq({ body: { total: 10 } }), res);

      expect(res._status).toBe(200);
      expect(res._json.shouldShowNasaTlx).toBe(false);
      expect(res._json.sessionNumber).toBe(1);
      expect(res._json.sessionId).toBe("cccccccccccccccccccccccc");
      expect(mocks.usersCol.findOne).toHaveBeenCalledWith(
        { _id: new ObjectId(MOCK_USER_ID) },
        { projection: { role: 1 } }
      );
    });

    it("still prompts a contributor after session 1 and not after session 2", async () => {
      const first = setupMocks();
      first.sessionsCol.countDocuments.mockResolvedValue(1);
      first.usersCol.findOne.mockResolvedValue({ role: "user" });
      const res1 = createMockRes();
      await handler(createMockReq({ body: { total: 10 } }), res1);
      expect(res1._json.shouldShowNasaTlx).toBe(true);

      const second = setupMocks();
      second.sessionsCol.countDocuments.mockResolvedValue(2);
      second.usersCol.findOne.mockResolvedValue({ role: "user" });
      const res2 = createMockRes();
      await handler(createMockReq({ body: { total: 10 } }), res2);
      expect(res2._json.shouldShowNasaTlx).toBe(false);
    });

    it("keeps the committed session and skips the prompt when the role lookup throws", async () => {
      const mocks = setupMocks();
      mocks.sessionsCol.countDocuments.mockResolvedValue(1);
      mocks.usersCol.findOne.mockRejectedValue(new Error("db down"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = createMockRes();

      await handler(createMockReq({ body: { total: 10 } }), res);
      errorSpy.mockRestore();

      expect(res._status).toBe(200);
      expect(res._json.shouldShowNasaTlx).toBe(false);
      expect(res._json.sessionNumber).toBe(1);
      expect(mocks.sessionsCol.updateOne).toHaveBeenCalledWith(
        { userId: MOCK_USER_ID, status: "active" },
        expect.objectContaining({ $set: expect.objectContaining({ status: "completed" }) })
      );
      expect(mocks.annotationsCol.updateMany).toHaveBeenCalledWith(
        { userId: MOCK_USER_ID, status: "pending" },
        { $set: { status: "completed" } }
      );
    });
  });
});
