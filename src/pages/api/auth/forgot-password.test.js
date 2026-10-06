import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb } from "@/test-utils/api-helpers";

const mockSendMail = vi.fn().mockResolvedValue({ messageId: "test-id" });
vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
}));

import { connectToDatabase } from "@/util/mongodb";
import handler from "./forgot-password.js";

function setupMocks({ userExists = true } = {}) {
  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue(
      userExists ? { email: "user@example.com", username: "testuser" } : null
    ),
  });
  const db = createMockDb({ users: usersCol });
  connectToDatabase.mockResolvedValue({ db });
  return { db, usersCol };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("POST /api/auth/forgot-password", () => {
  it("returns 200 when user exists and email is sent", async () => {
    setupMocks();
    const req = createMockReq({ body: { email: "user@example.com" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with same message when user does not exist", async () => {
    setupMocks({ userExists: false });
    const req = createMockReq({ body: { email: "nobody@example.com" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("stores hashed token on user record", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: { email: "user@example.com" } });
    const res = createMockRes();
    await handler(req, res);
    const updateCall = mocks.usersCol.updateOne.mock.calls[0];
    expect(updateCall[0]).toEqual({ email: "user@example.com" });
    expect(updateCall[1].$set).toHaveProperty("resetPasswordToken");
    expect(updateCall[1].$set).toHaveProperty("resetPasswordExpire");
    expect(updateCall[1].$set.resetPasswordToken).toHaveLength(64);
  });

  it("returns 405 for non-POST methods", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it("returns 422 for invalid email", async () => {
    const req = createMockReq({ body: { email: "not-an-email" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
  });

  it("returns 422 for non-string email", async () => {
    const req = createMockReq({ body: { email: { $gt: "" } } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
  });
});
