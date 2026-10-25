import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { createMockReq, createMockRes, createMockCollection, createMockDb } from "@/test-utils/api-helpers";

// The verification mail (S9), sent through a stand-in transporter
const mockSendMail = vi.fn().mockResolvedValue({ messageId: "test-id" });
vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed-pw") } }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
}));

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

// SIGNUP_ROLE server switch (6 Oct 2026)
describe("POST /api/auth/register with SIGNUP_ROLE", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("creates an annotator with the annotator fields when SIGNUP_ROLE=annotator", async () => {
    vi.stubEnv("SIGNUP_ROLE", "annotator");
    const mocks = setupMocks();
    const res = createMockRes();
    await handler(createMockReq({ body: validBody }), res);
    expect(res._status).toBe(201);
    expect(mocks.usersCol.insertOne.mock.calls[0][0]).toMatchObject({
      role: "annotator", annotatorPass: 1, annotatorActive: true,
    });
  });

  it("creates a contributor with no annotator fields without it, even with the old local switch set", async () => {
    vi.stubEnv("SIGNUP_ROLE", "");
    // The replaced setting no longer does anything
    vi.stubEnv("REGISTER_AS_ANNOTATOR", "true");
    vi.stubEnv("MONGODB_DB", "imprint_dev");
    const mocks = setupMocks();
    await handler(createMockReq({ body: validBody }), createMockRes());
    const doc = mocks.usersCol.insertOne.mock.calls[0][0];
    expect(doc.role).toBe("user");
    expect(doc).not.toHaveProperty("annotatorPass");
    expect(doc).not.toHaveProperty("annotatorActive");
  });

  it("creates an annotator on the live site and the study database when switched on", async () => {
    vi.stubEnv("SIGNUP_ROLE", "annotator");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MONGODB_DB", "imprint");
    const mocks = setupMocks();
    await handler(createMockReq({ body: validBody }), createMockRes());
    expect(mocks.usersCol.insertOne.mock.calls[0][0].role).toBe("annotator");
  });
});

// SIGNUP_PILOT server switch (S11, 23 Oct 2026)
describe("POST /api/auth/register with SIGNUP_PILOT", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("creates a contributor with isPilot true when SIGNUP_PILOT=true", async () => {
    vi.stubEnv("SIGNUP_ROLE", "");
    vi.stubEnv("SIGNUP_PILOT", "true");
    const mocks = setupMocks();
    const res = createMockRes();
    await handler(createMockReq({ body: validBody }), res);
    expect(res._status).toBe(201);
    const doc = mocks.usersCol.insertOne.mock.calls[0][0];
    expect(doc).toMatchObject({ role: "user", isPilot: true });
    expect(doc).not.toHaveProperty("annotatorPass");
    expect(doc).not.toHaveProperty("annotatorActive");
  });

  it("writes no isPilot field when SIGNUP_PILOT is missing, empty or anything other than true", async () => {
    for (const value of [undefined, "", "TRUE", "1", "false"]) {
      vi.stubEnv("SIGNUP_ROLE", "");
      vi.stubEnv("SIGNUP_PILOT", value);
      const mocks = setupMocks();
      await handler(createMockReq({ body: validBody }), createMockRes());
      const doc = mocks.usersCol.insertOne.mock.calls.at(-1)[0];
      expect(doc.role).toBe("user");
      expect(doc).not.toHaveProperty("isPilot");
    }
  });

  it("creates an annotator without isPilot when SIGNUP_ROLE=annotator is also on", async () => {
    vi.stubEnv("SIGNUP_ROLE", "annotator");
    vi.stubEnv("SIGNUP_PILOT", "true");
    const mocks = setupMocks();
    await handler(createMockReq({ body: validBody }), createMockRes());
    const doc = mocks.usersCol.insertOne.mock.calls[0][0];
    expect(doc).toMatchObject({ role: "annotator", annotatorPass: 1, annotatorActive: true });
    expect(doc).not.toHaveProperty("isPilot");
  });

  it("changes nothing else about the new account, consent and the 18+ confirmation included", async () => {
    vi.stubEnv("SIGNUP_ROLE", "");
    vi.stubEnv("SIGNUP_PILOT", "");
    const off = setupMocks();
    await handler(createMockReq({ body: validBody }), createMockRes());
    const offDoc = off.usersCol.insertOne.mock.calls[0][0];

    vi.stubEnv("SIGNUP_PILOT", "true");
    const on = setupMocks();
    await handler(createMockReq({ body: validBody }), createMockRes());
    const onDoc = on.usersCol.insertOne.mock.calls[0][0];

    expect(Object.keys(onDoc).sort()).toEqual([...Object.keys(offDoc), "isPilot"].sort());
    expect(onDoc.consentAgreedAt).toBeInstanceOf(Date);
    expect(onDoc.ageConfirmedAt).toBeInstanceOf(Date);
    expect(onDoc.hasCompletedTutorial).toBe(false);
    expect(onDoc.totalAnnotations).toBe(0);
  });

  it("still refuses a sign-up without consent while it is on", async () => {
    vi.stubEnv("SIGNUP_PILOT", "true");
    const mocks = setupMocks();
    const res = createMockRes();
    await handler(createMockReq({ body: { ...validBody, consentAgreed: false } }), res);
    expect(res._status).toBe(422);
    expect(mocks.usersCol.insertOne).not.toHaveBeenCalled();
  });
});

// Email verification (S9, decided 21 Oct 2026)
describe("POST /api/auth/register email verification", () => {
  const sha256 = (t) => crypto.createHash("sha256").update(t).digest("hex");
  const linkIn = (mail) => /href="([^"]+\/verify-email\?[^"]+)"/.exec(mail.html)[1].replace(/&amp;/g, "&");

  it("stores the address trimmed and lowercased, and checks it that way", async () => {
    const mocks = setupMocks();
    const res = createMockRes();
    await handler(createMockReq({ body: { ...validBody, email: "  New.Person@Example.COM " } }), res);
    expect(res._status).toBe(201);
    expect(mocks.usersCol.findOne).toHaveBeenCalledWith({ email: "new.person@example.com" });
    expect(mocks.usersCol.insertOne.mock.calls[0][0].email).toBe("new.person@example.com");
  });

  it("refuses a second account for the same address in different case", async () => {
    const usersCol = createMockCollection({
      findOne: vi.fn().mockImplementation(async (query) => (query.email === "new@example.com" ? { email: "new@example.com" } : null)),
    });
    connectToDatabase.mockResolvedValue({ db: createMockDb({ users: usersCol }) });
    const res = createMockRes();
    await handler(createMockReq({ body: { ...validBody, email: "NEW@Example.com" } }), res);
    expect(res._status).toBe(409);
    expect(res._json.message).toContain("email");
    expect(usersCol.insertOne).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("starts unconfirmed with a hashed token that works for 24 hours", async () => {
    const mocks = setupMocks();
    const before = Date.now();
    await handler(createMockReq({ body: validBody }), createMockRes());
    const doc = mocks.usersCol.insertOne.mock.calls[0][0];
    expect(doc.emailVerifiedAt).toBeNull();
    expect(doc.emailVerifyToken).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.emailVerifySentAt).toBeInstanceOf(Date);
    const ttl = doc.emailVerifyExpire.getTime() - doc.createdAt.getTime();
    expect(ttl).toBe(24 * 60 * 60 * 1000);
    expect(doc.createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("sends Confirm your email for IMPRINT with a link whose token only the hash of is stored", async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://imprint.example.org/");
    const mocks = setupMocks();
    const res = createMockRes();
    await handler(createMockReq({ body: validBody }), res);
    vi.unstubAllEnvs();
    expect(res._json.emailSent).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe("new@example.com");
    expect(mail.subject).toBe("Confirm your email for IMPRINT");
    const link = new URL(linkIn(mail));
    expect(link.origin + link.pathname).toBe("https://imprint.example.org/verify-email");
    expect(link.searchParams.get("email")).toBe("new@example.com");
    const token = link.searchParams.get("token");
    const doc = mocks.usersCol.insertOne.mock.calls[0][0];
    expect(token).not.toBe(doc.emailVerifyToken);
    expect(sha256(token)).toBe(doc.emailVerifyToken);
  });

  it("keeps the account when the mail cannot be sent, and lets the person resend at once", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("smtp down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mocks = setupMocks();
    const res = createMockRes();
    await handler(createMockReq({ body: validBody }), res);
    errorSpy.mockRestore();
    expect(res._status).toBe(201);
    expect(res._json.emailSent).toBe(false);
    expect(mocks.usersCol.insertOne).toHaveBeenCalledTimes(1);
    expect(mocks.usersCol.updateOne).toHaveBeenCalledWith({ email: "new@example.com" }, { $set: { emailVerifySentAt: null } });
  });
});
