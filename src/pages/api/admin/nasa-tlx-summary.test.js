import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./nasa-tlx-summary.js";

function setupAdminMocks({ submitted = 0, dismissed = 0, scaleAverages = [] } = {}) {
  getServerSession.mockResolvedValue(mockAuthSession({ role: "admin" }));

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "admin" }),
  });

  let countCall = 0;
  const nasaTlxCol = createMockCollection({
    countDocuments: vi.fn().mockImplementation(() => {
      return Promise.resolve(countCall++ === 0 ? submitted : dismissed);
    }),
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(scaleAverages),
    }),
  });

  const db = createMockDb({
    users: usersCol,
    nasa_tlx: nasaTlxCol,
  });

  connectToDatabase.mockResolvedValue({ db });
  return { db, nasaTlxCol };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/nasa-tlx-summary", () => {
  it("returns 405 for non-GET methods", async () => {
    const req = createMockReq({ method: "POST" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(405);
  });

  it("returns 401 when not authenticated", async () => {
    getServerSession.mockResolvedValue(null);
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(401);
  });

  it("returns NASA-TLX summary for admin", async () => {
    setupAdminMocks({
      submitted: 10,
      dismissed: 3,
      scaleAverages: [{
        _id: null,
        mentalDemand: 45.5,
        physicalDemand: 20.0,
        temporalDemand: 35.0,
        performance: 25.0,
        effort: 50.0,
        frustration: 15.0,
      }],
    });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.totalSubmitted).toBe(10);
    expect(res._json.totalDismissed).toBe(3);
    expect(res._json.totalResponses).toBe(13);
    expect(res._json.dismissalRate).toBe(23.1);
    expect(res._json.averages.mentalDemand).toBe(45.5);
    expect(res._json.averages.frustration).toBe(15);
  });

  it("returns zero rates when no responses exist", async () => {
    setupAdminMocks();
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.totalResponses).toBe(0);
    expect(res._json.dismissalRate).toBe(0);
    expect(res._json.averages).toEqual({});
  });
});
