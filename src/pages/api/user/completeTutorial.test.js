import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("../auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./completeTutorial.js";

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

describe("POST /api/user/completeTutorial", () => {
  it("returns 200 on success", async () => {
    setupMocks();
    const req = createMockReq({ body: {} });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.message).toContain("successfully");
  });

  it("sets hasCompletedTutorial to true", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: {} });
    const res = createMockRes();
    await handler(req, res);
    const [, update] = mocks.usersCol.updateOne.mock.calls[0];
    expect(update.$set.hasCompletedTutorial).toBe(true);
  });

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
});
