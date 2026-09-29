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
});
