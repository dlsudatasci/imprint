import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { createMockReq, createMockRes, createMockCollection, createMockDb } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("new-hashed-pw") } }));

import { connectToDatabase } from "@/util/mongodb";
import handler from "./reset-password.js";

const PLAIN_TOKEN = "a".repeat(64);
const HASHED_TOKEN = crypto.createHash("sha256").update(PLAIN_TOKEN).digest("hex");

function setupMocks({ userExists = true, tokenValid = true, tokenExpired = false } = {}) {
  const futureDate = new Date(Date.now() + 3600000);
  const pastDate = new Date(Date.now() - 3600000);

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue(
      userExists
        ? {
            email: "user@example.com",
            resetPasswordToken: tokenValid ? HASHED_TOKEN : "wrong-hash",
            resetPasswordExpire: tokenExpired ? pastDate : futureDate,
          }
        : null
    ),
  });
  const db = createMockDb({ users: usersCol });
  connectToDatabase.mockResolvedValue({ db });
  return { db, usersCol };
}

const validBody = { email: "user@example.com", token: PLAIN_TOKEN, newPassword: "newsecurepass" };

beforeEach(() => { vi.clearAllMocks(); });

describe("POST /api/auth/reset-password", () => {
  it("returns 200 for valid token and password", async () => {
    setupMocks();
    const req = createMockReq({ body: validBody });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.message).toContain("successfully");
  });

  it("updates password and clears token", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: validBody });
    const res = createMockRes();
    await handler(req, res);
    const [filter, update] = mocks.usersCol.updateOne.mock.calls[0];
    expect(filter).toEqual({ email: "user@example.com" });
    expect(update.$set.hashedPassword).toBe("new-hashed-pw");
    expect(update.$unset).toHaveProperty("resetPasswordToken");
    expect(update.$unset).toHaveProperty("resetPasswordExpire");
  });

  it("returns 400 when user does not exist", async () => {
    setupMocks({ userExists: false });
    const req = createMockReq({ body: validBody });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when token is invalid", async () => {
    setupMocks({ tokenValid: false });
    const req = createMockReq({ body: validBody });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when token is expired", async () => {
    setupMocks({ tokenExpired: true });
    const req = createMockReq({ body: validBody });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 422 for missing fields", async () => {
    setupMocks();
    const req = createMockReq({ body: { email: 123, token: "abc", newPassword: "pass" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
  });

  it("returns 422 for password too short", async () => {
    setupMocks();
    const req = createMockReq({ body: { ...validBody, newPassword: "ab" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
  });

  it("returns 405 for non-POST methods", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});
