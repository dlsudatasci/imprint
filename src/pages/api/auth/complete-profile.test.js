import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./complete-profile.js";

const validBody = {
  age: "20-24",
  gender: "Male",
  disability: "No",
  commuteFrequency: "Daily",
  educationalAttainment: "Bachelor's",
  occupation: "Software Engineer",
  walkingFrequency: "Daily",
  accessibilityFamiliarity: "Somewhat familiar",
  priorAnnotationExperience: "No",
  frequentlyWalkedCities: ["Makati", "Manila"],
  temporaryMobility: "No",
};

function setupMocks({ hasSession = true } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession() : null
  );

  const usersCol = createMockCollection();
  const db = createMockDb({ users: usersCol });
  connectToDatabase.mockResolvedValue({ db });
  return { db, usersCol };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/complete-profile", () => {
  it("returns 200 for a valid profile", async () => {
    setupMocks();
    const req = createMockReq({ body: validBody });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.message).toContain("successfully");
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ body: validBody });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(401);
  });

  it("returns 400 for invalid age group", async () => {
    setupMocks();
    const req = createMockReq({ body: { ...validBody, age: "1-5" } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(400);
  });

  it("returns 400 for empty occupation", async () => {
    setupMocks();
    const req = createMockReq({ body: { ...validBody, occupation: "" } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(400);
  });

  it("returns 400 for occupation over 100 chars", async () => {
    setupMocks();
    const req = createMockReq({ body: { ...validBody, occupation: "a".repeat(101) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(400);
  });

  it("returns 422 for too many cities", async () => {
    setupMocks();
    const manyCities = Array.from({ length: 21 }, (_, i) => `City${i}`);
    const req = createMockReq({ body: { ...validBody, frequentlyWalkedCities: manyCities } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(422);
  });

  it("returns 405 for non-POST method", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(405);
  });

  it("upserts to users collection on valid submission", async () => {
    const mocks = setupMocks();
    const req = createMockReq({ body: validBody });
    const res = createMockRes();

    await handler(req, res);

    expect(mocks.usersCol.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = mocks.usersCol.updateOne.mock.calls[0];
    expect(filter).toHaveProperty("email");
    expect(update.$set).toHaveProperty("age", "20-24");
    expect(update.$set).toHaveProperty("occupation", "Software Engineer");
    expect(update.$set).toHaveProperty("temporaryMobility", "No");
    expect(options.upsert).toBe(true);
  });

  it("returns 400 for invalid temporaryMobility", async () => {
    setupMocks();
    const req = createMockReq({ body: { ...validBody, temporaryMobility: "Sometimes" } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(400);
  });
});

// SIGNUP_ROLE server switch (6 Oct 2026): a Google user who completes the
// profile before choosing a username creates the account here
describe("POST /api/auth/complete-profile with SIGNUP_ROLE", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("creates a new account as an annotator with the annotator fields, on insert only", async () => {
    vi.stubEnv("SIGNUP_ROLE", "annotator");
    const mocks = setupMocks();
    await handler(createMockReq({ body: validBody }), createMockRes());
    const [, update] = mocks.usersCol.updateOne.mock.calls[0];
    expect(update.$setOnInsert).toMatchObject({ role: "annotator", annotatorPass: 1, annotatorActive: true });
    // An existing account keeps its role and fields
    for (const field of ["role", "annotatorPass", "annotatorActive"]) {
      expect(update.$set).not.toHaveProperty(field);
    }
  });

  it("creates a new account as a contributor with only role user without it", async () => {
    vi.stubEnv("SIGNUP_ROLE", "");
    const mocks = setupMocks();
    await handler(createMockReq({ body: validBody }), createMockRes());
    const [, update] = mocks.usersCol.updateOne.mock.calls[0];
    expect(update.$setOnInsert.role).toBe("user");
    expect(update.$setOnInsert).not.toHaveProperty("annotatorPass");
    expect(update.$setOnInsert).not.toHaveProperty("annotatorActive");
  });
});
