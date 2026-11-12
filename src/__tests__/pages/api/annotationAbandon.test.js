import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("@/util/telemetryLogger", () => ({ logTelemetryEvent: vi.fn() }));
vi.mock("@/util/retrainingNotice", () => ({ notifyRetrainingReady: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { notifyRetrainingReady } from "@/util/retrainingNotice";
import handler from "@/pages/api/annotationAbandon.js";

function setupMocks({ hasSession = true, activeSession = undefined } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession({ _id: MOCK_USER_ID }) : null
  );

  const defaultActiveSession = {
    _id: "session-1",
    userId: MOCK_USER_ID,
    status: "active",
    imageIDs: [],
    completedImageIDs: [42, 43],
  };

  const sessionsCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue(
      activeSession === undefined ? defaultActiveSession : activeSession
    ),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  });

  const annotationsCol = createMockCollection({
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 2 }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 1 }),
  });

  const usersCol = createMockCollection();
  const imageCol = createMockCollection({
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
  });

  const db = createMockDb({
    sessions: sessionsCol,
    annotations: annotationsCol,
    users: usersCol,
    Image: imageCol,
  });

  connectToDatabase.mockResolvedValue({ db });
  return { db, sessionsCol, annotationsCol, usersCol, imageCol };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/annotationAbandon", () => {
  it("copies only annotators' answers onto reference images they finished (1 Oct 2026)", async () => {
    const m = setupMocks({
      activeSession: { _id: "session-1", userId: MOCK_USER_ID, status: "active", imageIDs: ["ref-oid"], completedImageIDs: [42] },
    });
    m.imageCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ _id: "ref-oid", imageID: 42 }]) });
    const ann = { imageID: 42, source: "annotator", sceneLevel: {}, selectedObjectsID: [], newObjects: [{ id: "n1", obstructs: true, severity: 2 }] };
    m.annotationsCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([ann]) });
    m.imageCol.bulkWrite = vi.fn().mockResolvedValue({});

    const res = createMockRes();
    await handler(createMockReq({ body: {} }), res);

    expect(res._status).toBe(200);
    const filter = m.annotationsCol.find.mock.calls[0][0];
    expect(filter).toEqual({ userId: MOCK_USER_ID, imageID: { $in: [42] }, status: "completed", source: "annotator" });
    const [op] = m.imageCol.bulkWrite.mock.calls[0][0];
    expect(op.updateOne.update.$push.referenceGroundTruth).toMatchObject({ source: "annotator", newObjects: ann.newObjects });
  });

  // Guard: the outline on a flagged reference image stays in the annotations
  // collection and never enters the contributors' answer key (6 Oct 2026)
  it("leaves the sidewalk outline out of the referenceGroundTruth entry", async () => {
    const m = setupMocks({
      activeSession: { _id: "session-1", userId: MOCK_USER_ID, status: "active", imageIDs: ["ref-oid"], completedImageIDs: [42] },
    });
    m.imageCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ _id: "ref-oid", imageID: 42, sidewalkAgreement: true }]) });
    const ann = { imageID: 42, source: "annotator", sceneLevel: null, selectedObjectsID: [], newObjects: [], sidewalkMask: { noSidewalk: false, polygons: [{ id: "w1", kind: "walk", points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 0, y: 9 }] }] } };
    m.annotationsCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([ann]) });
    m.imageCol.bulkWrite = vi.fn().mockResolvedValue({});

    await handler(createMockReq({ body: {} }), createMockRes());

    const [op] = m.imageCol.bulkWrite.mock.calls[0][0];
    expect(op.updateOne.update.$push.referenceGroundTruth).not.toHaveProperty("sidewalkMask");
  });

  // Photo frame fix (9 Oct 2026): same marker as annotationComplete
  it("carries canvasVersion into the referenceGroundTruth entry only when the annotation has it", async () => {
    const pushed = async (extra) => {
      vi.clearAllMocks();
      const m = setupMocks({
        activeSession: { _id: "session-1", userId: MOCK_USER_ID, status: "active", imageIDs: ["ref-oid"], completedImageIDs: [42] },
      });
      m.imageCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ _id: "ref-oid", imageID: 42 }]) });
      const ann = { imageID: 42, source: "annotator", sceneLevel: null, selectedObjectsID: [], newObjects: [], ...extra };
      m.annotationsCol.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([ann]) });
      m.imageCol.bulkWrite = vi.fn().mockResolvedValue({});
      await handler(createMockReq({ body: {} }), createMockRes());
      return m.imageCol.bulkWrite.mock.calls[0][0][0].updateOne.update.$push.referenceGroundTruth;
    };
    expect((await pushed({ canvasVersion: 2 })).canvasVersion).toBe(2);
    expect(await pushed({})).not.toHaveProperty("canvasVersion");
    // The scale its scene answers are on (22 Oct 2026), the same way
    const scene = { sidewalkWidth: "two_people", overallAccessibility: 5, surfaceEvenness: 3, surfaceType: "concrete", surfaceCondition: 3, roadBarrier: false };
    expect(await pushed({ sceneLevel: scene, sceneScale: 2 })).toMatchObject({ sceneLevel: scene, sceneScale: 2 });
    expect(await pushed({ sceneLevel: scene })).not.toHaveProperty("sceneScale");
    // Step 1 (S15) beside sceneLevel, null for a row without one (an annotator's)
    expect(await pushed({ sceneLevel: scene, hasSidewalk: false })).toMatchObject({ sceneLevel: scene, hasSidewalk: false });
    expect(await pushed({ sceneLevel: scene, hasSidewalk: true })).toMatchObject({ hasSidewalk: true });
    expect((await pushed({})).hasSidewalk).toBeNull();
  });

  it("returns 200 when abandoning a session with completed images", async () => {
    setupMocks();
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.message).toContain("abandoned");
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(401);
  });

  it("returns 404 when no active session exists", async () => {
    setupMocks({ activeSession: null });
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(404);
  });

  it("returns 405 for non-POST methods", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(405);
  });

  it("marks session as abandoned", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(mocks.sessionsCol.updateOne).toHaveBeenCalledWith(
      { _id: "session-1" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "abandoned" }) })
    );
  });

  it("promotes completed images to completed status", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(mocks.annotationsCol.updateMany).toHaveBeenCalledWith(
      { userId: MOCK_USER_ID, status: "pending", imageID: { $in: [42, 43] } },
      { $set: { status: "completed" } }
    );
  });

  it("deletes remaining pending annotations", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(mocks.annotationsCol.deleteMany).toHaveBeenCalledWith({
      userId: MOCK_USER_ID,
      status: "pending",
    });
  });

  it("increments annotationCount on completed images", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(mocks.imageCol.updateMany).toHaveBeenCalledWith(
      { imageID: { $in: [42, 43] } },
      { $inc: { annotationCount: 1 } }
    );
  });

  it("does not increment annotationCount when no images were completed", async () => {
    const mocks = setupMocks({
      activeSession: {
        _id: "session-1",
        userId: MOCK_USER_ID,
        status: "active",
        imageIDs: [],
        completedImageIDs: [],
      },
    });
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(mocks.imageCol.updateMany).not.toHaveBeenCalled();
  });

  it("increments user totalAnnotations by modifiedCount", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(mocks.usersCol.updateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ $inc: { totalAnnotations: 2 } })
    );
  });
});

describe("POST /api/annotationAbandon, the retraining-ready email (S26)", () => {
  async function abandon() {
    const res = createMockRes();
    await handler(createMockReq(), res);
    return res;
  }

  it("a contributor's session end with sent photos checks the notice, after they are completed", async () => {
    const m = setupMocks();
    m.usersCol.findOne.mockResolvedValue({ role: "user" });
    notifyRetrainingReady.mockImplementation(async () => {
      // Everything is saved before the check runs
      expect(m.annotationsCol.updateMany).toHaveBeenCalledWith(
        { userId: MOCK_USER_ID, status: "pending", imageID: { $in: [42, 43] } }, { $set: { status: "completed" } }
      );
      expect(m.annotationsCol.deleteMany).toHaveBeenCalled();
      return { sent: true, target: 2000 };
    });

    const res = await abandon();
    expect(res._status).toBe(200);
    expect(notifyRetrainingReady).toHaveBeenCalledTimes(1);
    expect(notifyRetrainingReady).toHaveBeenCalledWith(m.db);
    // The role is read from the database, not the session
    expect(m.usersCol.findOne).toHaveBeenCalledWith(expect.anything(), { projection: { role: 1 } });
  });

  it("an annotator's session end does not", async () => {
    const m = setupMocks();
    m.usersCol.findOne.mockResolvedValue({ role: "annotator" });
    const res = await abandon();
    expect(res._status).toBe(200);
    expect(notifyRetrainingReady).not.toHaveBeenCalled();
  });

  it("a session stopped with no photo sent does not, nothing became completed", async () => {
    setupMocks({ activeSession: { _id: "session-1", userId: MOCK_USER_ID, status: "active", imageIDs: [], completedImageIDs: [] } });
    const res = await abandon();
    expect(res._status).toBe(200);
    expect(notifyRetrainingReady).not.toHaveBeenCalled();
  });

  it("a notice or role lookup that throws leaves the status and body as they are", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setupMocks();
    notifyRetrainingReady.mockResolvedValue({ sent: false, reason: "not-ready" });
    const normal = await abandon();

    setupMocks();
    notifyRetrainingReady.mockRejectedValue(new Error("mail server down"));
    const failingNotice = await abandon();

    const m3 = setupMocks();
    m3.usersCol.findOne.mockRejectedValue(new Error("users unreachable"));
    const failingRole = await abandon();

    expect(normal._status).toBe(200);
    for (const res of [failingNotice, failingRole]) {
      expect(res._status).toBe(normal._status);
      expect(res._json).toEqual(normal._json);
    }
    expect(console.error).toHaveBeenCalledTimes(2);
    console.error.mockRestore();
  });
});
