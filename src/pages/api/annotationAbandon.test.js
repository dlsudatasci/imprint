import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("@/util/telemetryLogger", () => ({ logTelemetryEvent: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./annotationAbandon.js";

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
