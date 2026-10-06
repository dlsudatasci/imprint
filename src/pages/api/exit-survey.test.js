import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockReq,
  createMockRes,
  createMockCollection,
  createMockDb,
  mockAuthSession,
  MOCK_USER_ID,
} from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("@/util/telemetryLogger", () => ({ logTelemetryEvent: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import handler from "./exit-survey.js";
import { CONTRIBUTOR_ONLY_MESSAGE } from "@/util/validators/contributorInstruments";

function validBody() {
  return {
    responses: {
      overallExperience: "It was easy to use overall.",
      clarityAndDifficulty: null,
      fatigue: null,
      behaviorChange: null,
      stopReason: null,
      aiSuggestionsImpact: "Suggestions were helpful for common objects.",
      aiReliance: null,
      improvements: null,
      additionalComments: null,
    },
  };
}

function setupMocks({ hasSession = true, existingSurvey = null, userRole = "user" } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession() : null
  );

  const exitSurveysCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue(existingSurvey),
  });
  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ role: userRole }),
  });
  const db = createMockDb({ exit_surveys: exitSurveysCol, users: usersCol });
  connectToDatabase.mockResolvedValue({ db });
  return { db, exitSurveysCol, usersCol };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/exit-survey", () => {
  it("saves a valid submission and returns 200", async () => {
    const { exitSurveysCol } = setupMocks();
    const req = createMockReq({ body: validBody() });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(exitSurveysCol.updateOne).toHaveBeenCalledWith(
      { userId: MOCK_USER_ID },
      expect.objectContaining({
        $set: expect.objectContaining({
          userId: MOCK_USER_ID,
          responses: expect.objectContaining({
            overallExperience: "It was easy to use overall.",
          }),
        }),
      }),
      { upsert: true }
    );
  });

  it("logs EXIT_SURVEY_SUBMITTED telemetry", async () => {
    setupMocks();
    const req = createMockReq({ body: validBody() });
    const res = createMockRes();

    await handler(req, res);

    expect(logTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "EXIT_SURVEY_SUBMITTED" })
    );
  });

  it("returns 422 for invalid payload (all empty)", async () => {
    setupMocks();
    const req = createMockReq({
      body: { responses: { overallExperience: null } },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(422);
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ body: validBody() });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(401);
  });
});

describe("GET /api/exit-survey", () => {
  it("returns existing survey for the user", async () => {
    const existing = {
      responses: { overallExperience: "Good" },
      completedAt: new Date(),
    };
    const { exitSurveysCol } = setupMocks({ existingSurvey: existing });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.survey).toEqual(existing);
    expect(exitSurveysCol.findOne).toHaveBeenCalledWith(
      { userId: MOCK_USER_ID },
      { projection: { _id: 0, userId: 0 } }
    );
  });

  it("returns null when no survey exists", async () => {
    setupMocks({ existingSurvey: null });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.survey).toBeNull();
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(401);
  });
});

describe("Method guard", () => {
  it("returns 405 for unsupported methods", async () => {
    const req = createMockReq({ method: "DELETE" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(405);
    expect(res._headers.Allow).toEqual(["GET", "POST"]);
  });
});

// Annotators cannot open or submit the exit survey (3 Oct 2026)
describe("annotators", () => {
  it("refuses GET with 403 without reading exit_surveys", async () => {
    const { exitSurveysCol } = setupMocks({ userRole: "annotator" });
    const res = createMockRes();

    await handler(createMockReq({ method: "GET" }), res);

    expect(res._status).toBe(403);
    expect(res._json.message).toBe(CONTRIBUTOR_ONLY_MESSAGE);
    expect(exitSurveysCol.findOne).not.toHaveBeenCalled();
  });

  it("refuses POST with 403, writes nothing and logs no telemetry", async () => {
    const { exitSurveysCol } = setupMocks({ userRole: "annotator" });
    const res = createMockRes();

    await handler(createMockReq({ method: "POST", body: validBody() }), res);

    expect(res._status).toBe(403);
    expect(res._json.message).toBe(CONTRIBUTOR_ONLY_MESSAGE);
    expect(exitSurveysCol.updateOne).not.toHaveBeenCalled();
    expect(logTelemetryEvent).not.toHaveBeenCalled();
  });

  it("returns 500 when the role lookup throws", async () => {
    const { usersCol, exitSurveysCol } = setupMocks();
    usersCol.findOne.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = createMockRes();

    await handler(createMockReq({ method: "GET" }), res);
    errorSpy.mockRestore();

    expect(res._status).toBe(500);
    expect(exitSurveysCol.findOne).not.toHaveBeenCalled();
  });

  it("still answers PUT with 405 before reading the role", async () => {
    const { usersCol } = setupMocks({ userRole: "annotator" });
    const res = createMockRes();

    await handler(createMockReq({ method: "PUT" }), res);

    expect(res._status).toBe(405);
    expect(usersCol.findOne).not.toHaveBeenCalled();
  });
});
