import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./updateSessionCount.js";

// A ten-photo session with photos 1 to 6 sent: the next unfinished photo is 7 (S20)
const ACTIVE = { imageIDs: Array.from({ length: 10 }, (_, i) => `img-${i + 1}`), completedImageIDs: [1, 2, 3, 4, 5, 6], totalCount: 10 };

function setupMocks({ hasSession = true, active = ACTIVE } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession({ _id: MOCK_USER_ID }) : null
  );
  const sessionsCol = createMockCollection({ findOne: vi.fn().mockResolvedValue(active) });
  const db = createMockDb({ sessions: sessionsCol });
  connectToDatabase.mockResolvedValue({ db });
  return { db, sessionsCol };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("POST /api/updateSessionCount", () => {
  it("returns 200 with valid count", async () => {
    setupMocks();
    const req = createMockReq({ body: { currentAnnotationCount: 5 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
  });

  it("updates session with correct count", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: { currentAnnotationCount: 5 } });
    const res = createMockRes();
    await handler(req, res);
    expect(mocks.sessionsCol.updateOne).toHaveBeenCalledWith(
      { userId: MOCK_USER_ID, status: "active" },
      { $set: { currentCount: 5 } }
    );
  });

  it("accepts count of 0", async () => {
    setupMocks();
    const req = createMockReq({ body: { currentAnnotationCount: 0 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
  });

  it("returns 400 for negative count", async () => {
    setupMocks();
    const req = createMockReq({ body: { currentAnnotationCount: -1 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 for non-integer count", async () => {
    setupMocks();
    const req = createMockReq({ body: { currentAnnotationCount: 3.5 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 for NaN count", async () => {
    setupMocks();
    const req = createMockReq({ body: { currentAnnotationCount: "abc" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ body: { currentAnnotationCount: 5 } });
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
});

// S20 (7 Nov 2026): never past the next unfinished photo of the active session
describe("POST /api/updateSessionCount caps the position", () => {
  async function send(count, options) {
    const mocks = setupMocks(options);
    const res = createMockRes();
    await handler(createMockReq({ body: { currentAnnotationCount: count } }), res);
    return { mocks, res, stored: mocks.sessionsCol.updateOne.mock.calls[0]?.[1].$set.currentCount };
  }

  it("reads the active session's photos and sent photos", async () => {
    const { mocks } = await send(3);
    expect(mocks.sessionsCol.findOne).toHaveBeenCalledWith(
      { userId: MOCK_USER_ID, status: "active" },
      { projection: { imageIDs: 1, completedImageIDs: 1, totalCount: 1 } }
    );
  });

  it("stores a position past the next unfinished photo as that photo, and returns it with 200", async () => {
    for (const count of [8, 10, 11, 500]) {
      vi.clearAllMocks();
      const { res, stored } = await send(count);
      expect(res._status).toBe(200);
      expect(stored).toBe(7);
      expect(res._json.currentCount).toBe(7);
    }
  });

  it("passes every position the client sends back and forward unchanged", async () => {
    // imageNavigation.test.js's cases: back to 1, forward up to the furthest reached
    for (const count of [1, 2, 3, 4, 5, 6, 7]) {
      vi.clearAllMocks();
      const { stored, res } = await send(count);
      expect(stored).toBe(count);
      expect(res._json.currentCount).toBe(count);
    }
  });

  it("still accepts 0", async () => {
    const { res, stored } = await send(0);
    expect(res._status).toBe(200);
    expect(stored).toBe(0);
  });

  it("allows the finished screen, one past the last photo, once every photo is sent", async () => {
    const done = { ...ACTIVE, completedImageIDs: Array.from({ length: 10 }, (_, i) => i + 1) };
    expect((await send(11, { active: done })).stored).toBe(11);
    vi.clearAllMocks();
    expect((await send(15, { active: done })).stored).toBe(11);
  });

  it("stores nothing and answers 200 as before when there is no active session", async () => {
    const { mocks, res } = await send(5, { active: null });
    expect(res._status).toBe(200);
    expect(mocks.sessionsCol.updateOne).not.toHaveBeenCalled();
    expect(res._json.currentCount).toBeNull();
  });
});
