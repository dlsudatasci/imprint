import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./choose-username.js";

function setupMocks({ hasSession = true, usernameTaken = false } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession() : null
  );
  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue(usernameTaken ? { username: "taken" } : null),
  });
  const db = createMockDb({ users: usersCol });
  connectToDatabase.mockResolvedValue({ db });
  return { db, usersCol };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("POST /api/auth/choose-username", () => {
  it("returns 200 for a valid username", async () => {
    setupMocks();
    const req = createMockReq({ body: { username: "newuser", consentAgreed: true, ageConfirmed: true } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.message).toContain("successfully");
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ body: { username: "newuser" } });
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

  it("returns 400 for empty username", async () => {
    setupMocks();
    const req = createMockReq({ body: { username: "" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 for non-string username", async () => {
    setupMocks();
    const req = createMockReq({ body: { username: 12345 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 422 for username that fails pattern", async () => {
    setupMocks();
    const req = createMockReq({ body: { username: "ab" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
  });

  it("returns 409 when username is taken", async () => {
    setupMocks({ usernameTaken: true });
    const req = createMockReq({ body: { username: "taken_name", consentAgreed: true, ageConfirmed: true } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(409);
  });

  it("returns 422 when consentAgreed is missing or false", async () => {
    setupMocks();
    const req = createMockReq({ body: { username: "newuser", consentAgreed: false, ageConfirmed: true } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
    expect(res._json.message.toLowerCase()).toContain("consent");
  });

  it("returns 422 when ageConfirmed is missing or false", async () => {
    setupMocks();
    const req = createMockReq({ body: { username: "newuser", consentAgreed: true, ageConfirmed: false } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
    expect(res._json.message).toContain("18");
  });

  it("upserts to users collection with correct fields", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: { username: "newuser", consentAgreed: true, ageConfirmed: true } });
    const res = createMockRes();
    await handler(req, res);
    expect(mocks.usersCol.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = mocks.usersCol.updateOne.mock.calls[0];
    expect(filter).toEqual({ email: "test@example.com" });
    expect(update.$set.username).toBe("newuser");
    expect(update.$set.consentAgreedAt).toBeInstanceOf(Date);
    expect(update.$set.ageConfirmedAt).toBeInstanceOf(Date);
    expect(update.$setOnInsert.role).toBe("user");
    expect(options.upsert).toBe(true);
  });
});

// SIGNUP_ROLE server switch (6 Oct 2026)
describe("POST /api/auth/choose-username with SIGNUP_ROLE", () => {
  afterEach(() => vi.unstubAllEnvs());
  const body = { username: "newuser", consentAgreed: true, ageConfirmed: true };

  it("creates a new Google account as an annotator with the annotator fields, on insert only", async () => {
    vi.stubEnv("SIGNUP_ROLE", "annotator");
    vi.stubEnv("NODE_ENV", "production");
    const mocks = setupMocks();
    await handler(createMockReq({ body }), createMockRes());
    const [, update] = mocks.usersCol.updateOne.mock.calls[0];
    expect(update.$setOnInsert).toMatchObject({ role: "annotator", annotatorPass: 1, annotatorActive: true });
    // An existing account keeps its role and fields
    for (const field of ["role", "annotatorPass", "annotatorActive"]) {
      expect(update.$set).not.toHaveProperty(field);
    }
  });

  it("creates a contributor with no annotator fields without it, even with the old local switch set", async () => {
    vi.stubEnv("SIGNUP_ROLE", "");
    // The replaced setting no longer does anything
    vi.stubEnv("REGISTER_AS_ANNOTATOR", "true");
    vi.stubEnv("MONGODB_DB", "imprint_dev");
    const mocks = setupMocks();
    await handler(createMockReq({ body }), createMockRes());
    const [, update] = mocks.usersCol.updateOne.mock.calls[0];
    expect(update.$setOnInsert.role).toBe("user");
    expect(update.$setOnInsert).not.toHaveProperty("annotatorPass");
    expect(update.$setOnInsert).not.toHaveProperty("annotatorActive");
  });
});

// SIGNUP_PILOT server switch (S11, 23 Oct 2026)
describe("POST /api/auth/choose-username with SIGNUP_PILOT", () => {
  afterEach(() => vi.unstubAllEnvs());
  const body = { username: "newuser", consentAgreed: true, ageConfirmed: true };

  it("creates a new Google account as a contributor with isPilot true, on insert only", async () => {
    vi.stubEnv("SIGNUP_ROLE", "");
    vi.stubEnv("SIGNUP_PILOT", "true");
    const mocks = setupMocks();
    const res = createMockRes();
    await handler(createMockReq({ body }), res);
    expect(res._status).toBe(200);
    const [, update] = mocks.usersCol.updateOne.mock.calls[0];
    expect(update.$setOnInsert).toMatchObject({ role: "user", isPilot: true });
    expect(update.$setOnInsert).not.toHaveProperty("annotatorPass");
    // An existing account is never marked
    expect(update.$set).not.toHaveProperty("isPilot");
  });

  it("writes no isPilot field when SIGNUP_PILOT is missing, empty or anything other than true", async () => {
    for (const value of [undefined, "", "TRUE", "1", "false"]) {
      vi.stubEnv("SIGNUP_ROLE", "");
      vi.stubEnv("SIGNUP_PILOT", value);
      const mocks = setupMocks();
      await handler(createMockReq({ body }), createMockRes());
      const [, update] = mocks.usersCol.updateOne.mock.calls.at(-1);
      expect(update.$setOnInsert.role).toBe("user");
      expect(update.$setOnInsert).not.toHaveProperty("isPilot");
      expect(update.$set).not.toHaveProperty("isPilot");
    }
  });

  it("creates an annotator without isPilot when SIGNUP_ROLE=annotator is also on", async () => {
    vi.stubEnv("SIGNUP_ROLE", "annotator");
    vi.stubEnv("SIGNUP_PILOT", "true");
    const mocks = setupMocks();
    await handler(createMockReq({ body }), createMockRes());
    const [, update] = mocks.usersCol.updateOne.mock.calls[0];
    expect(update.$setOnInsert).toMatchObject({ role: "annotator", annotatorPass: 1, annotatorActive: true });
    expect(update.$setOnInsert).not.toHaveProperty("isPilot");
    expect(update.$set).not.toHaveProperty("isPilot");
  });

  it("still asks for consent and the 18+ confirmation while it is on", async () => {
    vi.stubEnv("SIGNUP_PILOT", "true");
    for (const missing of ["consentAgreed", "ageConfirmed"]) {
      const mocks = setupMocks();
      const res = createMockRes();
      await handler(createMockReq({ body: { ...body, [missing]: false } }), res);
      expect(res._status).toBe(422);
      expect(mocks.usersCol.updateOne).not.toHaveBeenCalled();
    }
  });
});

// Email verification (S9): Google has verified the address
describe("POST /api/auth/choose-username email verification", () => {
  const body = { username: "newuser", consentAgreed: true, ageConfirmed: true };

  it("creates a Google account confirmed, on insert only, so an existing account is never confirmed here", async () => {
    const mocks = setupMocks();
    const before = Date.now();
    await handler(createMockReq({ body }), createMockRes());
    const [, update] = mocks.usersCol.updateOne.mock.calls[0];
    expect(update.$setOnInsert.emailVerifiedAt).toBeInstanceOf(Date);
    expect(update.$setOnInsert.emailVerifiedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(update.$set).not.toHaveProperty("emailVerifiedAt");
  });

  it("matches and stores the address trimmed and lowercased", async () => {
    getServerSession.mockResolvedValue(mockAuthSession({ email: " Test@Example.COM" }));
    const usersCol = createMockCollection({ findOne: vi.fn().mockResolvedValue(null) });
    connectToDatabase.mockResolvedValue({ db: createMockDb({ users: usersCol }) });
    await handler(createMockReq({ body }), createMockRes());
    expect(usersCol.findOne.mock.calls[0][0]).toEqual({ username: "newuser", email: { $ne: "test@example.com" } });
    const [filter, update] = usersCol.updateOne.mock.calls[0];
    expect(filter).toEqual({ email: "test@example.com" });
    expect(update.$set.email).toBe("test@example.com");
  });
});
