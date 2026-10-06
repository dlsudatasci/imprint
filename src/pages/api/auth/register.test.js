import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed-pw") } }));

import { connectToDatabase } from "@/util/mongodb";
import handler from "./register.js";

const validBody = {
  username: "testuser",
  password: "securepass123",
  email: "new@example.com",
  consentAgreed: true,
  ageConfirmed: true,
};

function setupMocks({ emailTaken = false, usernameTaken = false } = {}) {
  const usersCol = createMockCollection({
    findOne: vi.fn().mockImplementation((query) => {
      if (query.email && emailTaken) return Promise.resolve({ email: "new@example.com" });
      if (query.username && usernameTaken) return Promise.resolve({ username: "testuser" });
      return Promise.resolve(null);
    }),
  });
  const db = createMockDb({ users: usersCol });
  connectToDatabase.mockResolvedValue({ db });
  return { db, usersCol };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("POST /api/auth/register", () => {
  it("returns 201 for a valid registration", async () => {
    setupMocks();
    const req = createMockReq({ body: validBody });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(201);
    expect(res._json.message).toContain("successfully");
  });

  it("returns 405 for non-POST methods", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it("returns 422 when fields are not strings", async () => {
    setupMocks();
    const req = createMockReq({ body: { username: 123, password: "abc", email: "a@b.c" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
  });

  it("returns 422 for invalid email", async () => {
    setupMocks();
    const req = createMockReq({ body: { ...validBody, email: "not-an-email" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
    expect(res._json.message).toContain("email");
  });

  it("returns 422 for password too short", async () => {
    setupMocks();
    const req = createMockReq({ body: { ...validBody, password: "ab" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
    expect(res._json.message).toContain("Password");
  });

  it("returns 422 for invalid username pattern", async () => {
    setupMocks();
    const req = createMockReq({ body: { ...validBody, username: "a" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
    expect(res._json.message).toContain("Username");
  });

  it("returns 409 when email is already registered", async () => {
    setupMocks({ emailTaken: true });
    const req = createMockReq({ body: validBody });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(409);
    expect(res._json.message).toContain("email");
  });

  it("returns 409 when username is taken", async () => {
    setupMocks({ usernameTaken: true });
    const req = createMockReq({ body: validBody });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(409);
    expect(res._json.message).toContain("username");
  });

  it("returns 422 when consentAgreed is missing or false", async () => {
    setupMocks();
    const req = createMockReq({ body: { ...validBody, consentAgreed: false } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
    expect(res._json.message.toLowerCase()).toContain("consent");
  });

  it("returns 422 when ageConfirmed is missing or false", async () => {
    setupMocks();
    const req = createMockReq({ body: { ...validBody, ageConfirmed: false } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(422);
    expect(res._json.message).toContain("18");
  });

  it("inserts user with correct initial fields", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: validBody });
    const res = createMockRes();
    await handler(req, res);
    const insertCall = mocks.usersCol.insertOne.mock.calls[0][0];
    expect(insertCall.username).toBe("testuser");
    expect(insertCall.email).toBe("new@example.com");
    expect(insertCall.hashedPassword).toBe("hashed-pw");
    expect(insertCall.totalAnnotations).toBe(0);
    expect(insertCall.hasCompletedTutorial).toBe(false);
    expect(insertCall.role).toBe("user");
    expect(insertCall.consentAgreedAt).toBeInstanceOf(Date);
    expect(insertCall.ageConfirmedAt).toBeInstanceOf(Date);
  });
});

// Local testing only (6 Oct 2026): REGISTER_AS_ANNOTATOR=true makes new
// accounts annotators, except in production or against the study database
describe("POST /api/auth/register with REGISTER_AS_ANNOTATOR", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("creates an annotator on a local database when the switch is on", async () => {
    vi.stubEnv("MONGODB_DB", "imprint_dev");
    vi.stubEnv("REGISTER_AS_ANNOTATOR", "true");
    const mocks = setupMocks();
    const res = createMockRes();
    await handler(createMockReq({ body: validBody }), res);
    expect(res._status).toBe(201);
    expect(mocks.usersCol.insertOne.mock.calls[0][0].role).toBe("annotator");
  });

  it("still creates a contributor against the study database", async () => {
    vi.stubEnv("MONGODB_DB", "imprint");
    vi.stubEnv("REGISTER_AS_ANNOTATOR", "true");
    const mocks = setupMocks();
    await handler(createMockReq({ body: validBody }), createMockRes());
    expect(mocks.usersCol.insertOne.mock.calls[0][0].role).toBe("user");
  });
});
