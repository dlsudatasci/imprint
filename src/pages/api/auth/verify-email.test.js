import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { ObjectId } from "mongodb";
import { createMockReq, createMockRes, createMockCollection, createMockDb } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import handler from "./verify-email.js";

// POST /api/auth/verify-email (S9, decided 21 Oct 2026)
const TOKEN = "f".repeat(64);
const HASH = crypto.createHash("sha256").update(TOKEN).digest("hex");
const USER_ID = new ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb");
const waiting = (overrides = {}) => ({
  _id: USER_ID,
  emailVerifiedAt: null,
  emailVerifyToken: HASH,
  emailVerifyExpire: new Date(Date.now() + 60 * 60 * 1000),
  ...overrides,
});

function setup(user = waiting(), updateResult = { modifiedCount: 1 }) {
  const users = createMockCollection({
    findOne: vi.fn().mockResolvedValue(user),
    updateOne: vi.fn().mockResolvedValue(updateResult),
  });
  connectToDatabase.mockResolvedValue({ db: createMockDb({ users }) });
  return users;
}

const post = (body) => createMockReq({ method: "POST", body });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/auth/verify-email", () => {
  it("confirms the address with a good link, clears the token and adds the activity", async () => {
    const users = setup();
    const res = createMockRes();
    await handler(post({ email: "new@example.com", token: TOKEN }), res);
    expect(res._status).toBe(200);
    expect(res._json.verified).toBe(true);
    const [filter, update] = users.updateOne.mock.calls[0];
    // Matching the token too, so two clicks at once confirm once
    expect(filter).toEqual({ _id: USER_ID, emailVerifyToken: HASH });
    expect(update.$set.emailVerifiedAt).toBeInstanceOf(Date);
    expect(update.$unset).toEqual({ emailVerifyToken: "", emailVerifyExpire: "", emailVerifySentAt: "" });
    expect(update.$push.activities.$slice).toBe(-100);
    expect(update.$push.activities.$each).toEqual([
      expect.objectContaining({ activity: "Confirmed your email", tag: "email", date: expect.any(Date) }),
    ]);
  });

  it("looks the account up by the address trimmed and lowercased", async () => {
    const users = setup();
    await handler(post({ email: " New@Example.COM ", token: TOKEN }), createMockRes());
    expect(users.findOne.mock.calls[0][0]).toEqual({ email: "new@example.com" });
  });

  it("refuses an expired link with its own message and changes nothing", async () => {
    const users = setup(waiting({ emailVerifyExpire: new Date(Date.now() - 1000) }));
    const res = createMockRes();
    await handler(post({ email: "new@example.com", token: TOKEN }), res);
    expect(res._status).toBe(400);
    expect(res._json.code).toBe("expired");
    expect(res._json.message).toContain("expired");
    expect(users.updateOne).not.toHaveBeenCalled();
  });

  it("refuses a wrong link, and an address with no account, as not valid", async () => {
    for (const user of [waiting(), null]) {
      const users = setup(user);
      const res = createMockRes();
      await handler(post({ email: "new@example.com", token: "0".repeat(64) }), res);
      expect(res._status).toBe(400);
      expect(res._json.code).toBe("invalid");
      expect(users.updateOne).not.toHaveBeenCalled();
    }
  });

  it("says a reused link was already used once the address is confirmed", async () => {
    const users = setup({ _id: USER_ID, emailVerifiedAt: new Date("2026-10-24") });
    const res = createMockRes();
    await handler(post({ email: "new@example.com", token: TOKEN }), res);
    expect(res._status).toBe(409);
    expect(res._json.code).toBe("used");
    expect(users.updateOne).not.toHaveBeenCalled();
  });

  it("reports used when another click confirmed it between the read and the write", async () => {
    setup(waiting(), { modifiedCount: 0 });
    const res = createMockRes();
    await handler(post({ email: "new@example.com", token: TOKEN }), res);
    expect(res._status).toBe(409);
    expect(res._json.code).toBe("used");
  });

  it("refuses a link without a token or an address, or with values that are not strings", async () => {
    for (const body of [{ email: "a@b.c" }, { token: TOKEN }, { email: { $ne: null }, token: TOKEN }, { email: "a@b.c", token: ["x"] }, undefined]) {
      setup();
      const res = createMockRes();
      await handler(post(body), res);
      expect(res._status).toBe(400);
      expect(connectToDatabase).not.toHaveBeenCalled();
    }
  });

  it("returns 405 for other methods and 500 when the database fails", async () => {
    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res._status).toBe(405);

    connectToDatabase.mockRejectedValue(new Error("down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res2 = createMockRes();
    await handler(post({ email: "a@b.c", token: TOKEN }), res2);
    errorSpy.mockRestore();
    expect(res2._status).toBe(500);
  });
});
