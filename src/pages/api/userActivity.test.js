import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./userActivity.js";

function setupMocks({ hasSession = true } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession({ _id: MOCK_USER_ID }) : null
  );
  const usersCol = createMockCollection();
  const db = createMockDb({ users: usersCol });
  connectToDatabase.mockResolvedValue({ db });
  return { db, usersCol };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("POST /api/userActivity", () => {
  it("returns 200 for valid activity", async () => {
    setupMocks();
    const req = createMockReq({ body: { activity: "Completed session", tag: "session" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
  });

  it("pushes activity with $slice -100", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: { activity: "Completed session", tag: "session" } });
    const res = createMockRes();
    await handler(req, res);
    const [, update] = mocks.usersCol.updateOne.mock.calls[0];
    expect(update.$push.activities.$each[0].activity).toBe("Completed session");
    expect(update.$push.activities.$each[0].tag).toBe("session");
    expect(update.$push.activities.$slice).toBe(-100);
  });

  it("returns 400 when activity is not a string", async () => {
    setupMocks();
    const req = createMockReq({ body: { activity: 123, tag: "test" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when tag is not a string", async () => {
    setupMocks();
    const req = createMockReq({ body: { activity: "test", tag: null } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 422 for empty activity", async () => {
    setupMocks();
    const req = createMockReq({ body: { activity: "   ", tag: "test" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
  });

  it("returns 422 for activity over 200 chars", async () => {
    setupMocks();
    const req = createMockReq({ body: { activity: "x".repeat(201), tag: "test" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
  });

  it("returns 422 for tag over 50 chars", async () => {
    setupMocks();
    const req = createMockReq({ body: { activity: "test", tag: "x".repeat(51) } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ body: { activity: "test", tag: "test" } });
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
