import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler, { RETRAINING_INCREMENT, INITIAL_MODEL_VERSION } from "./retraining.js";

/**
 * The annotations and Image mocks apply the parts of a query the handler sends
 * (status, source $ne, imageID $in), so a test fails if the handler stops
 * asking for completed non-annotator annotations.
 */
function matches(doc, query = {}) {
  return Object.entries(query).every(([key, want]) => {
    if (want && typeof want === "object" && "$ne" in want) return doc[key] !== want.$ne;
    if (want && typeof want === "object" && "$in" in want) return want.$in.includes(doc[key]);
    return doc[key] === want;
  });
}

function setupAdminMocks({ cycles = [], versionDist = [], totalImages = 0, annotations = [], images = [], tauSetting = null } = {}) {
  getServerSession.mockResolvedValue(mockAuthSession({ role: "admin" }));

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "admin" }),
  });

  const telemetryCol = createMockCollection({
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(cycles),
      }),
    }),
  });

  const imageCol = createMockCollection({
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(versionDist),
    }),
    countDocuments: vi.fn().mockResolvedValue(totalImages),
    find: vi.fn((query) => ({ toArray: vi.fn().mockResolvedValue(images.filter((d) => matches(d, query))) })),
  });

  const annotationsCol = createMockCollection({
    find: vi.fn((query) => ({ toArray: vi.fn().mockResolvedValue(annotations.filter((d) => matches(d, query))) })),
  });

  const settingsCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue(tauSetting),
  });

  const db = createMockDb({
    users: usersCol,
    telemetry_logs: telemetryCol,
    Image: imageCol,
    annotations: annotationsCol,
    settings: settingsCol,
  });
  connectToDatabase.mockResolvedValue({ db });
  return { db, annotationsCol, imageCol };
}

async function getRetraining(mocks) {
  setupAdminMocks(mocks);
  const res = createMockRes();
  await handler(createMockReq({ method: "GET" }), res);
  return res;
}

// A box the retraining export keeps: a taxonomy category, a Yes or No, and
// 200 by 200 px on a 1920 by 1080 photo (about 4,400 px² in the 640 copy)
let boxSeq = 0;
const usableBox = (extra = {}) => ({
  id: `box-${++boxSeq}`, label: "car", editable: true,
  mark: { x: 10, y: 10, width: 200, height: 200 }, obstructs: true, ...extra,
});
const photo = (imageID, extra = {}) => ({ imageID, isReference: false, width: 1920, height: 1080, ...extra });
const annotation = (imageID, boxes, extra = {}) => ({
  imageID, userId: new ObjectId(), status: "completed", source: "contributor",
  selectedObjectsID: [], newObjects: boxes, ...extra,
});

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/retraining", () => {
  it("returns 405 for non-GET", async () => {
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

  it("returns 403 for non-admin", async () => {
    getServerSession.mockResolvedValue(mockAuthSession({ role: "user" }));
    const usersCol = createMockCollection({
      findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "user" }),
    });
    const db = createMockDb({ users: usersCol });
    connectToDatabase.mockResolvedValue({ db });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(403);
  });

  it("returns empty state when no retraining has occurred", async () => {
    const res = await getRetraining({ totalImages: 500 });

    expect(res._status).toBe(200);
    expect(res._json.cycleCount).toBe(0);
    expect(res._json.retrainingCycles).toEqual([]);
    expect(res._json.contributorJudgments).toBe(0);
    expect(res._json.contributorAnnotations).toBe(0);
    expect(res._json.retrainingCyclesRun).toBe(0);
    expect(res._json.nextRetrainingAt).toBe(2000);
    expect(res._json.judgmentsUntilNext).toBe(2000);
  });

  it("returns retraining history and version distribution", async () => {
    const cycleDate = new Date("2026-09-15T10:00:00Z");
    setupAdminMocks({
      cycles: [{
        modelVersion: "v1-retrained",
        timestamp: cycleDate,
        decisionThreshold: 0.42,
        predictionsInFile: 500,
        imagesUpdated: 480,
        proposalsWritten: 3100,
        imagesSkippedSameVersion: 20,
        servedImagesNotInFile: 0,
      }],
      versionDist: [
        { _id: "v1-retrained", count: 480 },
        { _id: "v0-mapillary", count: 20 },
      ],
      totalImages: 500,
    });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.cycleCount).toBe(1);
    expect(res._json.retrainingCycles[0].modelVersion).toBe("v1-retrained");
    expect(res._json.retrainingCycles[0]).toEqual({
      modelVersion: "v1-retrained",
      timestamp: cycleDate,
      decisionThreshold: 0.42,
      predictionsInFile: 500,
      imagesUpdated: 480,
      proposalsWritten: 3100,
      imagesSkippedSameVersion: 20,
      servedImagesNotInFile: 0,
    });
    expect(res._json.versionDistribution).toHaveLength(2);
    expect(res._json.versionDistribution[0].version).toBe("v1-retrained");
    expect(res._json.totalImages).toBe(500);
  });

  // The suggestion threshold τ in use (S2, 29 Oct 2026)
  it("returns the stored τ with its detector, precision and recall", async () => {
    const chosenAt = new Date("2026-10-29T01:00:00Z");
    setupAdminMocks({ tauSetting: { _id: "tau", value: 0.43, modelVersion: "det-v1-rfdetr-small", chosenAt, validationPrecision: 0.8, validationRecall: 0.71 } });
    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res._json.tau).toEqual({ value: 0.43, isDefault: false, modelVersion: "det-v1-rfdetr-small", chosenAt, validationPrecision: 0.8, validationRecall: 0.71 });
  });

  it("returns the default τ when none is stored", async () => {
    setupAdminMocks();
    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res._json.tau).toMatchObject({ value: 0.5, isDefault: true, modelVersion: null });
  });
});

/**
 * S24 (12 Nov 2026): the tab counts the contributor judgments the retraining
 * export would use (buildRetrainingRows on completed non-annotator
 * annotations), not every completed annotation, and puts the next cycle at
 * (cycles run + 1) × 2,000, where cycles run leaves out the starting model.
 */
describe("GET /api/admin/retraining, contributor judgments (S24)", () => {
  it("does not count annotator annotations", async () => {
    const res = await getRetraining({
      annotations: [
        annotation("img-1", [usableBox(), usableBox()], { source: "annotator" }),
        annotation("img-2", [usableBox(), usableBox()], { source: "annotator" }),
        annotation("img-3", [usableBox(), usableBox()]),
      ],
      images: [photo("img-1"), photo("img-2"), photo("img-3")],
    });
    expect(res._json.contributorJudgments).toBe(2);
    expect(res._json.contributorAnnotations).toBe(1);
  });

  it("asks only for completed annotations not from annotators, with only the fields the export reads", async () => {
    setupAdminMocks();
    const { db } = await connectToDatabase();
    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);
    const [query, options] = db.collection("annotations").find.mock.calls[0];
    expect(query).toEqual({ status: "completed", source: { $ne: "annotator" } });
    expect(Object.keys(options.projection).filter((k) => options.projection[k] === 1).sort()).toEqual(
      ["hasSidewalk", "imageID", "newObjects", "selectedObjectsID", "servedModelVersion", "source", "userId"]
    );
  });

  it("adds nothing for an annotation on a reference image, and counts it as one", async () => {
    const res = await getRetraining({
      annotations: [
        annotation("ref-1", [usableBox(), usableBox(), usableBox()]),
        annotation("img-1", [usableBox()]),
      ],
      images: [photo("ref-1", { isReference: true }), photo("img-1")],
    });
    expect(res._json.contributorJudgments).toBe(1);
    expect(res._json.contributorAnnotations).toBe(2);
    expect(res._json.contributorAnnotationsOnReference).toBe(1);
  });

  it("leaves out Not an object, a free-text category, a box with no Yes or No and a box under the minimum size", async () => {
    const res = await getRetraining({
      annotations: [annotation("img-1", [
        usableBox(),
        usableBox({ label: "not_an_object" }),
        usableBox({ label: "a shopping cart", comment: "a shopping cart" }),
        usableBox({ obstructs: null }),
        usableBox({ mark: { x: 0, y: 0, width: 30, height: 30 } }),
      ])],
      images: [photo("img-1")],
    });
    expect(res._json.contributorJudgments).toBe(1);
  });

  it("counts an annotation with no source as a contributor's, as the export does", async () => {
    const noSource = annotation("img-1", [usableBox(), usableBox()]);
    delete noSource.source;
    const res = await getRetraining({ annotations: [noSource], images: [photo("img-1")] });
    expect(res._json.contributorJudgments).toBe(2);
    expect(res._json.contributorAnnotations).toBe(1);
  });

  it("counts no cycles with no events, and puts the next at 2,000", async () => {
    const res = await getRetraining();
    expect(res._json.retrainingCyclesRun).toBe(0);
    expect(res._json.retrainingIncrement).toBe(RETRAINING_INCREMENT);
    expect(res._json.nextRetrainingAt).toBe(2000);
  });

  it("does not count the starting model's predictions as a cycle", async () => {
    const res = await getRetraining({ cycles: [{ modelVersion: INITIAL_MODEL_VERSION, timestamp: new Date() }] });
    expect(INITIAL_MODEL_VERSION).toBe("v1-xgboost");
    expect(res._json.retrainingCyclesRun).toBe(0);
    expect(res._json.cycleCount).toBe(1);
    expect(res._json.nextRetrainingAt).toBe(2000);
  });

  it("counts a version written in several partial runs once", async () => {
    const res = await getRetraining({
      cycles: ["v3-xgboost", "v2-xgboost", "v2-xgboost", "v1-xgboost"].map((modelVersion, i) => ({
        modelVersion, timestamp: new Date(Date.UTC(2026, 10, 12 - i)),
      })),
    });
    expect(res._json.retrainingCyclesRun).toBe(2);
    expect(res._json.cycleCount).toBe(4);
    expect(res._json.nextRetrainingAt).toBe(6000);
  });

  it("says ready, not next at 4,000, with 2,050 judgments before the first cycle", async () => {
    const boxes = Array.from({ length: 2050 }, () => usableBox());
    const res = await getRetraining({ annotations: [annotation("img-1", boxes)], images: [photo("img-1")] });
    expect(res._json.contributorJudgments).toBe(2050);
    expect(res._json.nextRetrainingAt).toBe(2000);
    expect(res._json.judgmentsUntilNext).toBe(0);
  });

  it("returns counts only, never usernames, ids or rows", async () => {
    const userId = new ObjectId();
    const res = await getRetraining({
      annotations: [annotation("img-secret-1", [usableBox({ id: "box-secret" })], { userId, username: "alice_contrib" })],
      images: [photo("img-secret-1")],
    });
    expect(Object.keys(res._json).sort()).toEqual([
      "contributorAnnotations", "contributorAnnotationsOnReference", "contributorJudgments", "cycleCount",
      "judgmentsUntilNext", "nextRetrainingAt", "retrainingCycles", "retrainingCyclesRun", "retrainingIncrement",
      "tau", "totalImages", "versionDistribution",
    ]);
    const body = JSON.stringify(res._json);
    for (const leaked of [String(userId), "alice_contrib", "img-secret-1", "box-secret", "pseudoUserId", "objectKey"]) {
      expect(body).not.toContain(leaked);
    }
  });
});
