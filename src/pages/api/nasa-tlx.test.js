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
import handler from "./nasa-tlx.js";
import { CONTRIBUTOR_ONLY_MESSAGE } from "@/util/validators/contributorInstruments";

const VALID_SESSION_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";

function validBody(overrides = {}) {
  return {
    sessionId: VALID_SESSION_ID,
    sessionNumber: 1,
    dismissed: false,
    responses: {
      mentalDemand: 10,
      physicalDemand: 5,
      temporalDemand: 8,
      performance: 12,
      effort: 9,
      frustration: 3,
    },
    ...overrides,
  };
}

function setupMocks({ hasSession = true, userRole = "user" } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession() : null
  );

  const nasaTlxCol = createMockCollection();
  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ role: userRole }),
  });
  const db = createMockDb({ nasa_tlx: nasaTlxCol, users: usersCol });
  connectToDatabase.mockResolvedValue({ db });
  return { db, nasaTlxCol, usersCol };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/nasa-tlx", () => {
  it("saves a valid submission and returns 200", async () => {
    const { nasaTlxCol } = setupMocks();
    const req = createMockReq({ body: validBody() });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(nasaTlxCol.updateOne).toHaveBeenCalledWith(
      { userId: MOCK_USER_ID, sessionId: VALID_SESSION_ID },
      expect.objectContaining({
        $set: expect.objectContaining({
          dismissed: false,
          responses: expect.objectContaining({ mentalDemand: 10 }),
        }),
      }),
      { upsert: true }
    );
  });

  it("saves a valid dismissal and returns 200", async () => {
    const { nasaTlxCol } = setupMocks();
    const req = createMockReq({
      body: { sessionId: VALID_SESSION_ID, sessionNumber: 1, dismissed: true },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(nasaTlxCol.updateOne).toHaveBeenCalledWith(
      { userId: MOCK_USER_ID, sessionId: VALID_SESSION_ID },
      expect.objectContaining({
        $set: expect.objectContaining({ dismissed: true, responses: null }),
      }),
      { upsert: true }
    );
  });

  it("logs NASA_TLX_SUBMITTED telemetry for a submission", async () => {
    setupMocks();
    const req = createMockReq({ body: validBody() });
    const res = createMockRes();

    await handler(req, res);

    expect(logTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "NASA_TLX_SUBMITTED" })
    );
  });

  it("logs NASA_TLX_DISMISSED telemetry for a dismissal", async () => {
    setupMocks();
    const req = createMockReq({
      body: { sessionId: VALID_SESSION_ID, sessionNumber: 1, dismissed: true },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(logTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "NASA_TLX_DISMISSED" })
    );
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ body: validBody() });
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

  it("returns 422 for invalid payload", async () => {
    setupMocks();
    const req = createMockReq({ body: { sessionId: "bad" } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(422);
  });

  it("returns 422 when responses are missing for non-dismissal", async () => {
    setupMocks();
    const body = validBody();
    delete body.responses;
    const req = createMockReq({ body });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(422);
  });

  // Annotators are never prompted and cannot submit (3 Oct 2026)
  describe("annotators", () => {
    it("refuses an annotator's submission with 403 and saves nothing", async () => {
      const { nasaTlxCol } = setupMocks({ userRole: "annotator" });
      const res = createMockRes();

      await handler(createMockReq({ body: validBody() }), res);

      expect(res._status).toBe(403);
      expect(res._json.message).toBe(CONTRIBUTOR_ONLY_MESSAGE);
      expect(nasaTlxCol.updateOne).not.toHaveBeenCalled();
      expect(logTelemetryEvent).not.toHaveBeenCalled();
    });

    it("refuses an annotator's dismissal too", async () => {
      const { nasaTlxCol } = setupMocks({ userRole: "annotator" });
      const res = createMockRes();

      await handler(createMockReq({ body: validBody({ dismissed: true, responses: null }) }), res);

      expect(res._status).toBe(403);
      expect(nasaTlxCol.updateOne).not.toHaveBeenCalled();
    });

    it("reads the role from the database, not the session", async () => {
      const { usersCol } = setupMocks({ userRole: "annotator" });
      getServerSession.mockResolvedValue(mockAuthSession({ role: "user" }));
      const res = createMockRes();

      await handler(createMockReq({ body: validBody() }), res);

      expect(res._status).toBe(403);
      expect(usersCol.findOne).toHaveBeenCalledWith(expect.anything(), { projection: { role: 1 } });
    });

    it("still saves a contributor's submission and dismissal", async () => {
      setupMocks({ userRole: "user" });
      const submitted = createMockRes();
      await handler(createMockReq({ body: validBody() }), submitted);
      expect(submitted._status).toBe(200);

      setupMocks({ userRole: "user" });
      const dismissed = createMockRes();
      await handler(createMockReq({ body: validBody({ dismissed: true, responses: null }) }), dismissed);
      expect(dismissed._status).toBe(200);
    });

    it("returns 500 when the role lookup throws", async () => {
      const { usersCol, nasaTlxCol } = setupMocks();
      usersCol.findOne.mockRejectedValue(new Error("db down"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = createMockRes();

      await handler(createMockReq({ body: validBody() }), res);
      errorSpy.mockRestore();

      expect(res._status).toBe(500);
      expect(nasaTlxCol.updateOne).not.toHaveBeenCalled();
    });
  });
});
