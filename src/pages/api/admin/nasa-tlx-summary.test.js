import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./nasa-tlx-summary.js";

function setupAdminMocks({ submitted = 0, dismissed = 0, scaleAverages = [], annotators = [] } = {}) {
  getServerSession.mockResolvedValue(mockAuthSession({ role: "admin" }));

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "admin" }),
    find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(annotators) }),
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
  return { db, nasaTlxCol, usersCol };
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

  // Annotators are not prompted (3 Oct 2026), so rows from annotator accounts
  // written before then are left out
  it("leaves out rows written by annotator accounts, matching both id forms", async () => {
    const annotatorId = new ObjectId("dddddddddddddddddddddddd");
    const { nasaTlxCol, usersCol } = setupAdminMocks({ annotators: [{ _id: annotatorId }] });
    const res = createMockRes();

    await handler(createMockReq({ method: "GET" }), res);

    expect(res._status).toBe(200);
    expect(usersCol.find).toHaveBeenCalledWith({ role: "annotator" }, { projection: { _id: 1 } });
    const expected = { $nin: ["dddddddddddddddddddddddd", annotatorId] };
    const [submittedFilter] = nasaTlxCol.countDocuments.mock.calls[0];
    const [dismissedFilter] = nasaTlxCol.countDocuments.mock.calls[1];
    expect(submittedFilter).toEqual({ dismissed: false, userId: expected });
    expect(dismissedFilter).toEqual({ dismissed: true, userId: expected });
    const [pipeline] = nasaTlxCol.aggregate.mock.calls[0];
    expect(pipeline[0].$match).toEqual({ dismissed: false, userId: expected });
  });

  it("gives unchanged totals and averages with no annotator accounts", async () => {
    const { nasaTlxCol } = setupAdminMocks({
      submitted: 4,
      dismissed: 1,
      scaleAverages: [{ _id: null, mentalDemand: 40, physicalDemand: 10, temporalDemand: 20, performance: 30, effort: 50, frustration: 5 }],
    });
    const res = createMockRes();

    await handler(createMockReq({ method: "GET" }), res);

    expect(res._json.totalSubmitted).toBe(4);
    expect(res._json.totalDismissed).toBe(1);
    expect(res._json.dismissalRate).toBe(20);
    expect(res._json.averages.mentalDemand).toBe(40);
    expect(nasaTlxCol.countDocuments.mock.calls[0][0]).toEqual({ dismissed: false, userId: { $nin: [] } });
  });
});
