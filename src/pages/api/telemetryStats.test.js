import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./telemetryStats.js";

function setupMocks({ hasSession = true, avgMs = 12000, dates = [] } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession({ _id: MOCK_USER_ID }) : null
  );

  const telemetryCol = {
    aggregate: vi.fn().mockImplementation(() => ({
      toArray: vi.fn().mockImplementation(() => {
        const callCount = telemetryCol.aggregate.mock.calls.length;
        if (callCount === 1) {
          return Promise.resolve(
            avgMs > 0 ? [{ _id: null, avgImageDurationMs: avgMs }] : []
          );
        }
        return Promise.resolve(dates.map((d) => ({ _id: d })));
      }),
    })),
  };

  const db = createMockDb({});
  db.collection = vi.fn((name) => {
    if (name === "telemetry_logs") return telemetryCol;
    return { findOne: vi.fn(), find: vi.fn() };
  });
  connectToDatabase.mockResolvedValue({ db });
  return { db, telemetryCol };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("GET /api/telemetryStats", () => {
  it("returns averageTimePerImageSeconds and currentStreak", async () => {
    setupMocks({ avgMs: 15000 });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.averageTimePerImageSeconds).toBe("15.00");
    expect(res._json.currentStreak).toBeDefined();
  });

  it("returns 0 seconds when no telemetry exists", async () => {
    setupMocks({ avgMs: 0 });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._json.averageTimePerImageSeconds).toBe("0.00");
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 405 for non-GET methods", async () => {
    const req = createMockReq({ method: "POST" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});
