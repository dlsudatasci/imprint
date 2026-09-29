import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockDb } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({
  connectToDatabase: vi.fn(),
}));

import { connectToDatabase } from "@/util/mongodb";
import handler from "./health.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("returns 200 when database is healthy", async () => {
    const mockDb = createMockDb();
    connectToDatabase.mockResolvedValue({ db: mockDb });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual({ status: "ok", database: "connected" });
    expect(res._headers["Cache-Control"]).toBe("no-store");
  });

  it("returns 503 when database is unreachable", async () => {
    connectToDatabase.mockRejectedValue(new Error("connection refused"));

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(503);
    expect(res._json).toEqual({ status: "degraded", database: "unreachable" });
  });

  it("returns 405 for non-GET methods", async () => {
    const req = createMockReq({ method: "POST" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(405);
    expect(res._headers["Allow"]).toEqual(["GET"]);
  });
});
