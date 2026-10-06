import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { createMockReq, createMockRes, createMockCollection, createMockDb } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import handler from "./verify-reset-token.js";

const PLAIN_TOKEN = "b".repeat(64);
const HASHED_TOKEN = crypto.createHash("sha256").update(PLAIN_TOKEN).digest("hex");

function setupMocks({ userExists = true, hasToken = true, expired = false } = {}) {
  const futureDate = new Date(Date.now() + 3600000);
  const pastDate = new Date(Date.now() - 3600000);

  const user = userExists
    ? {
        email: "user@example.com",
        resetPasswordToken: hasToken ? HASHED_TOKEN : undefined,
        resetPasswordExpire: hasToken ? (expired ? pastDate : futureDate) : undefined,
      }
    : null;

  const usersCol = createMockCollection({ findOne: vi.fn().mockResolvedValue(user) });
  const db = createMockDb({ users: usersCol });
  connectToDatabase.mockResolvedValue({ db });
  return { db, usersCol };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("POST /api/auth/verify-reset-token", () => {
  it("returns valid: true for a correct unexpired token", async () => {
    setupMocks();
    const req = createMockReq({ body: { email: "user@example.com", token: PLAIN_TOKEN } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.valid).toBe(true);
  });

  it("returns valid: false when user does not exist", async () => {
    setupMocks({ userExists: false });
    const req = createMockReq({ body: { email: "nobody@example.com", token: PLAIN_TOKEN } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._json.valid).toBe(false);
  });

  it("returns valid: false when user has no reset token", async () => {
    setupMocks({ hasToken: false });
    const req = createMockReq({ body: { email: "user@example.com", token: PLAIN_TOKEN } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._json.valid).toBe(false);
  });

  it("returns valid: false when token is expired", async () => {
    setupMocks({ expired: true });
    const req = createMockReq({ body: { email: "user@example.com", token: PLAIN_TOKEN } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._json.valid).toBe(false);
  });

  it("returns valid: false when token does not match", async () => {
    setupMocks();
    const req = createMockReq({ body: { email: "user@example.com", token: "wrong-token" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._json.valid).toBe(false);
  });

  it("returns 400 for non-string inputs", async () => {
    const req = createMockReq({ body: { email: 123, token: 456 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.valid).toBe(false);
  });

  it("returns 405 for non-POST methods", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});
