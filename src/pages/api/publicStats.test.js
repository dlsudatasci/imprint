import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({
  connectToDatabase: vi.fn(),
}));

import { connectToDatabase } from "@/util/mongodb";
import handler from "./publicStats.js";

beforeEach(() => {
  vi.clearAllMocks();
});

function setupMockDb() {
  const imageCollection = createMockCollection({
    countDocuments: vi.fn().mockResolvedValue(100),
  });

  const annotationCollection = createMockCollection({
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn()
        .mockResolvedValueOnce([{ _id: null, total: 50, avgRating: 3.5, users: ["u1", "u2"] }])
        .mockResolvedValueOnce([{ _id: "Car", count: 10 }, { _id: "Tree", count: 5 }])
        .mockResolvedValueOnce([{ _id: null, avg: 2.3, total: 115 }]),
    }),
  });

  const mockDb = createMockDb({
    Image: imageCollection,
    annotations: annotationCollection,
  });

  connectToDatabase.mockResolvedValue({ db: mockDb });
  return mockDb;
}

describe("GET /api/publicStats", () => {
  it("returns stats for all areas when no city param", async () => {
    setupMockDb();

    const req = createMockReq({ method: "GET", query: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.city).toBe("All Areas");
    expect(res._json.totalImages).toBe(100);
    expect(res._json.totalAnnotations).toBe(50);
    expect(res._json.totalContributors).toBe(2);
    expect(res._json.commonObstructions).toHaveLength(2);
    expect(res._json.commonObstructions[0]).toEqual({ type: "Car", count: 10 });
  });

  it("filters by city when city param is provided", async () => {
    setupMockDb();

    const req = createMockReq({ method: "GET", query: { city: "Makati" } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.city).toBe("Makati");
  });

  it("returns 405 for non-GET methods", async () => {
    const req = createMockReq({ method: "POST" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(405);
  });

  it("leaderboard pipeline excludes not_an_object boxes", async () => {
    const mockDb = setupMockDb();
    const req = createMockReq({ method: "GET", query: {} });
    const res = createMockRes();

    await handler(req, res);

    const aggregateCalls = mockDb.collection("annotations").aggregate.mock.calls;
    const leaderboardPipeline = aggregateCalls[1][0];
    const matchAfterUnwind = leaderboardPipeline.find(
      (stage, i) => i > 0 && stage.$match && stage.$match["boxes.comment"]
    );
    expect(matchAfterUnwind).toBeDefined();
    expect(matchAfterUnwind.$match["boxes.comment"].$ne).toBe("not_an_object");
  });

  it("response has the expected shape", async () => {
    setupMockDb();

    const req = createMockReq({ method: "GET", query: {} });
    const res = createMockRes();

    await handler(req, res);

    const json = res._json;
    expect(json).toHaveProperty("city");
    expect(json).toHaveProperty("totalImages");
    expect(json).toHaveProperty("totalAnnotations");
    expect(json).toHaveProperty("avgAccessibilityRating");
    expect(json).toHaveProperty("totalContributors");
    expect(json).toHaveProperty("avgObstructionsPerImage");
    expect(json).toHaveProperty("totalObstructions");
    expect(json).toHaveProperty("commonObstructions");
  });
});
