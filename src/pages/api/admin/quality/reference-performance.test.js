import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./reference-performance.js";

const USER_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const USER_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

function setupAdminMocks({
  refImages = [],
  annotations = [],
  userDocs = [],
} = {}) {
  getServerSession.mockResolvedValue(mockAuthSession({ role: "admin" }));

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(MOCK_USER_ID), role: "admin" }),
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(userDocs),
    }),
  });

  const imageCol = createMockCollection({
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(refImages),
    }),
  });

  const annotationsCol = createMockCollection({
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(annotations),
    }),
  });

  const db = createMockDb({
    users: usersCol,
    Image: imageCol,
    annotations: annotationsCol,
  });
  connectToDatabase.mockResolvedValue({ db });
  return { db };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/quality/reference-performance", () => {
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

  it("returns empty when no reference images exist", async () => {
    setupAdminMocks({ refImages: [] });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.contributors).toEqual([]);
    expect(res._json.referenceImageCount).toBe(0);
  });

  it("computes scores when reference data exists", async () => {
    setupAdminMocks({
      refImages: [{
        imageID: "img1",
        referenceGroundTruth: [{
          userId: USER_B,
          source: "annotator",
          sceneLevel: { sidewalkWidth: "two_people", surfaceCondition: 2, walkability: 3, overallAccessibility: 3 },
          selectedObjectsID: [{ mark: { x: 0, y: 0, width: 100, height: 100 }, comment: "tree", obstructs: true, severity: 3 }],
          newObjects: [],
        }],
      }],
      annotations: [{
        imageID: "img1",
        userId: USER_A,
        source: "contributor",
        status: "completed",
        sceneLevel: { sidewalkWidth: "two_people", surfaceCondition: 2, walkability: 3, overallAccessibility: 3 },
        selectedObjectsID: [{ mark: { x: 0, y: 0, width: 100, height: 100 }, comment: "tree", obstructs: true, severity: 4 }],
        newObjects: [],
      }],
      userDocs: [{ _id: new ObjectId(USER_A), username: "alice" }],
    });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.contributors).toHaveLength(1);
    expect(res._json.contributors[0].avgF1).toBe(1);
    expect(res._json.contributors[0].avgObstructionAgreement).toBe(1);
    // Annotators record neither severity nor scene answers (3 Oct 2026)
    expect(res._json.contributors[0]).not.toHaveProperty("avgSeverityMAE");
    expect(res._json.contributors[0]).not.toHaveProperty("avgSceneAgreement");
  });

  it("scores against the answer key merged from every annotator, not the first annotator only (2 Oct 2026)", async () => {
    const b = (x, comment) => ({ mark: { x, y: 0, width: 100, height: 100 }, comment, obstructs: false });
    const entry = (userId, boxes, submittedAt = "2026-10-02T00:00:00Z") => ({
      userId, source: "annotator", submittedAt, sceneLevel: null, selectedObjectsID: [], newObjects: boxes,
    });
    setupAdminMocks({
      refImages: [{
        imageID: "img1",
        referenceGroundTruth: [
          entry("ann1", []), // the first annotator missed the bench
          entry("ann2", [b(0, "bench")]),
          entry("ann3", [b(5, "bench")]),
          { userId: USER_B, source: "contributor", sceneLevel: null, selectedObjectsID: [], newObjects: [] },
        ],
      }],
      annotations: [{
        imageID: "img1", userId: USER_A, source: "contributor", status: "completed",
        sceneLevel: null, newObjects: [],
        // Shown as a suggestion, so the bench is in the task (S21)
        selectedObjectsID: [{ ...b(0, "bench"), initialState: { comment: "bench", mark: b(0).mark } }],
      }],
      userDocs: [{ _id: new ObjectId(USER_A), username: "alice" }],
    });
    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res._status).toBe(200);
    expect(res._json.contributors[0].avgF1).toBe(1);
    expect(res._json.answerKey).toEqual({
      objects: 1, objectsMostlyObstructing: 0, uncertain: 0, categoryTies: 0, boxesBelowMinimumSize: 0, annotatorsPerImage: { min: 3, max: 3 },
    });
  });

  it("leaves boxes under the minimum size out on both sides, using the image's size (6 Oct 2026)", async () => {
    const b = (x, w, comment) => ({ mark: { x, y: 0, width: w, height: w }, comment, obstructs: false });
    const entry = (userId) => ({
      userId, source: "annotator", submittedAt: "2026-10-06T00:00:00Z", sceneLevel: null,
      selectedObjectsID: [], newObjects: [b(0, 100, "bench"), b(500, 30, "tree")],
    });
    const { db } = setupAdminMocks({
      refImages: [{
        imageID: "img1", width: 1280, height: 960, // scaled by 0.5, so 30 by 30 is under the minimum
        referenceGroundTruth: [entry("ann1"), entry("ann2"), entry("ann3")],
      }],
      annotations: [
        {
          imageID: "img1", userId: USER_A, source: "contributor", status: "completed",
          sceneLevel: null, newObjects: [], // skipped the small tree, shown the bench (S21)
          selectedObjectsID: [{ ...b(0, 100, "bench"), initialState: { comment: "bench", mark: b(0, 100).mark } }],
        },
        {
          imageID: "img1", userId: USER_B, source: "contributor", status: "completed",
          sceneLevel: null, newObjects: [b(800, 30, "tree")],
          selectedObjectsID: [{ ...b(0, 100, "bench"), initialState: { comment: "bench", mark: b(0, 100).mark } }],
        },
      ],
      userDocs: [{ _id: new ObjectId(USER_A), username: "alice" }, { _id: new ObjectId(USER_B), username: "bob" }],
    });
    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res._status).toBe(200);
    expect(db.collection("Image").find.mock.calls[0][1].projection).toMatchObject({ width: 1, height: 1 });
    const byName = Object.fromEntries(res._json.contributors.map((c) => [c.username, c]));
    expect(byName.alice).toMatchObject({ avgRecall: 1, avgF1: 1 });
    expect(byName.bob).toMatchObject({ avgPrecision: 1, avgF1: 1 });
    expect(res._json.answerKey).toMatchObject({ objects: 1, uncertain: 0, boxesBelowMinimumSize: 3 });
  });

  it("scores recall on in-task objects only, with the new sums and recallRule (S21, 8 Nov 2026)", async () => {
    const b = (x, comment, extra = {}) => ({ mark: { x, y: 0, width: 100, height: 100 }, comment, obstructs: false, ...extra });
    const entry = (userId, boxes) => ({
      userId, source: "annotator", submittedAt: "2026-11-08T00:00:00Z", sceneLevel: null, selectedObjectsID: [], newObjects: boxes,
    });
    // img1: a tree two of three annotators said obstructs, a car, a bench far down the road. img2: only that bench.
    const img1 = ["ann1", "ann2", "ann3"].map((id, i) =>
      entry(id, [b(0, "tree", { obstructs: i < 2 }), b(300, "car"), b(900, "bench")]));
    const img2 = ["ann1", "ann2", "ann3"].map((id) => entry(id, [b(900, "bench")]));
    const shown = (x, comment, extra = {}) => ({ ...b(x, comment, extra), initialState: { comment, mark: b(x).mark } });
    setupAdminMocks({
      refImages: [
        { imageID: "img1", width: 1280, height: 960, referenceGroundTruth: img1 },
        { imageID: "img2", width: 1280, height: 960, referenceGroundTruth: img2 },
      ],
      annotations: [
        {
          // Shown the car and answered it, missed the obstructing tree, drew the far bench
          imageID: "img1", userId: USER_A, source: "contributor", status: "completed", sceneLevel: null,
          selectedObjectsID: [shown(300, "car")], newObjects: [b(900, "bench")],
        },
        {
          // Nothing in the task here: one suggestion saved before S5 (no initialState), marked Not an object
          imageID: "img2", userId: USER_A, source: "contributor", status: "completed", sceneLevel: null,
          selectedObjectsID: [{ ...b(500, "not_an_object") }], newObjects: [],
        },
      ],
      userDocs: [{ _id: new ObjectId(USER_A), username: "alice" }],
    });
    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res._status).toBe(200);
    expect(res._json.recallRule).toBe("in-task");
    expect(res._json.answerKey).toMatchObject({ objects: 4, objectsMostlyObstructing: 1 });

    const [alice] = res._json.contributors;
    expect(alice).toMatchObject({
      referenceImagesScored: 2,
      inTaskObjects: 2, // the tree (most said it obstructs) and the car (shown)
      outOfTaskObjects: 2, // the bench on both images
      truePositivesOutOfTask: 1,
      imagesWithoutInTaskObjects: 1,
      suggestionsWithoutInitialState: 1,
      avgPrecision: 1, // img1 only: img2 has no boxes, so its precision is null
      avgRecall: 0.5, // img1 only: 1 of 2 in-task objects. The old rule gave 2 of 3.
      avgF1: 0.6667,
    });
    expect(Object.keys(alice).sort()).toEqual([
      "avgF1", "avgObstructionAgreement", "avgPrecision", "avgRecall", "boxesOnUncertainObjects",
      "imagesWithoutInTaskObjects", "inTaskObjects", "outOfTaskObjects", "referenceImagesScored",
      "suggestionsWithoutInitialState", "truePositivesOutOfTask", "userId", "username",
    ]);
    // No annotator ids or other names in the response
    expect(JSON.stringify(res._json)).not.toMatch(/ann[123]/);
  });

  it("says which recall rule made an empty response too", async () => {
    setupAdminMocks({ refImages: [] });
    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res._json.recallRule).toBe("in-task");
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
});
