import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./updateSessionCount.js";

function setupMocks({ hasSession = true } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession({ _id: MOCK_USER_ID }) : null
  );
  const sessionsCol = createMockCollection();
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
