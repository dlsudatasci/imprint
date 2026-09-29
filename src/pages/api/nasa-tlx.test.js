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

function setupMocks({ hasSession = true } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession() : null
  );

  const nasaTlxCol = createMockCollection();
  const db = createMockDb({ nasa_tlx: nasaTlxCol });
  connectToDatabase.mockResolvedValue({ db });
  return { db, nasaTlxCol };
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
});
