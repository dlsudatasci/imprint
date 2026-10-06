import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("@/util/telemetryLogger", () => ({ logTelemetryEvent: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import handler from "./annotationSubmit.js";

const validBody = {
  imageID: 42,
  sceneLevel: {
    sidewalkWidth: "two_people",
    surfaceCondition: 2,
    walkability: 3,
    overallAccessibility: 3,
  },
  selectedObjectsID: [{ obstructs: true, severity: 3 }],
  newObjects: [{ obstructs: false }],
  currentAnnotationCount: 1,
};

const rect = (x, y, width, height) => ({ type: "RECT", x, y, width, height });

// A 1280 by 960 image with two visible pre-annotations
const ANNOTATOR_IMAGE = {
  city: "makati",
  width: 1280,
  height: 960,
  annotationList: [
    { id: "p1", comment: "tree", mark: rect(100, 100, 80, 200) },
    { id: "p2", comment: "car", mark: rect(400, 300, 200, 120) },
  ],
};

// An annotator's submission after Objects and Obstructions: one suggestion
// kept and answered No, one marked not an object, one drawn box answered Yes
function annotatorBody() {
  return {
    imageID: 42,
    selectedObjectsID: [
      { id: "p1", editable: false, selected: true, isRejected: false, comment: "tree", obstructs: false, severity: null, mark: rect(100, 100, 80, 200) },
      { id: "p2", editable: false, selected: false, isRejected: true, comment: "not_an_object", obstructs: null, severity: null, mark: rect(400, 300, 200, 120) },
    ],
    newObjects: [
      { id: "d1", editable: true, selected: false, comment: "bollard", obstructs: true, severity: null, mark: rect(700, 600, 30, 90) },
    ],
    currentAnnotationCount: 1,
  };
}

function setupMocks({ hasSession = true, userRole = "user" } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession({ _id: MOCK_USER_ID }) : null
  );

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ role: userRole }),
  });
  const sessionsCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ userId: MOCK_USER_ID, status: "active", imageIDs: [] }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  });
  const imageCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ city: "makati" }),
  });
  const annotationsCol = createMockCollection({
    countDocuments: vi.fn().mockResolvedValue(5),
  });

  const db = createMockDb({
    users: usersCol,
    sessions: sessionsCol,
    Image: imageCol,
    annotations: annotationsCol,
  });

  connectToDatabase.mockResolvedValue({ db });
  return { db, usersCol, sessionsCol, imageCol, annotationsCol };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/annotationSubmit", () => {
  it("returns 200 for a valid submission", async () => {
    setupMocks();
    const req = createMockReq({ body: validBody });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.message).toContain("successfully");
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ body: validBody });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(401);
  });

  it("returns 400 when imageID is missing", async () => {
    setupMocks();
    const req = createMockReq({ body: { ...validBody, imageID: undefined } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(400);
  });

  it("returns 422 when sceneLevel is missing", async () => {
    setupMocks();
    const req = createMockReq({ body: { ...validBody, sceneLevel: null } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(422);
  });

  it("returns 422 for invalid sidewalkWidth", async () => {
    setupMocks();
    const req = createMockReq({
      body: { ...validBody, sceneLevel: { ...validBody.sceneLevel, sidewalkWidth: "maybe" } },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(422);
  });

  it("returns 422 when box missing obstructs", async () => {
    setupMocks();
    const req = createMockReq({
      body: { ...validBody, selectedObjectsID: [{ severity: 3 }] },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(422);
  });

  it("returns 409 when no active session exists", async () => {
    const mocks = setupMocks();
    mocks.sessionsCol.findOne.mockResolvedValue(null);
    const req = createMockReq({ body: validBody });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(409);
  });

  it("returns 403 when image is not in session", async () => {
    const mocks = setupMocks();
    mocks.imageCol.findOne.mockResolvedValue(null);
    const req = createMockReq({ body: validBody });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(403);
  });

  it("returns 405 for non-POST methods", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(405);
  });

  it("tags contributor source correctly", async () => {
    const mocks = setupMocks({ userRole: "user" });
    const req = createMockReq({ body: validBody });
    const res = createMockRes();

    await handler(req, res);

    const updateCall = mocks.annotationsCol.updateOne.mock.calls[0];
    expect(updateCall[1].$set.source).toBe("contributor");
  });

  it("tags annotator source correctly", async () => {
    const mocks = setupMocks({ userRole: "annotator" });
    mocks.imageCol.findOne.mockResolvedValue(ANNOTATOR_IMAGE);
    const req = createMockReq({ body: annotatorBody() });
    const res = createMockRes();

    await handler(req, res);

    const updateCall = mocks.annotationsCol.updateOne.mock.calls[0];
    expect(updateCall[1].$set.source).toBe("annotator");
    expect(updateCall[1].$set.servedModelVersion).toBeNull();
  });

  it("includes cumulativeAnnotationsToDate in telemetry event", async () => {
    const mocks = setupMocks();
    mocks.annotationsCol.countDocuments.mockResolvedValue(12);
    const telemetry = { imageDurationMs: 5000, manualBoxCount: 1 };
    const req = createMockReq({ body: { ...validBody, telemetry } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(logTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "IMAGE_SUBMITTED",
        cumulativeAnnotationsToDate: 12,
        imageDurationMs: 5000,
      })
    );
  });

  it("does not call logTelemetryEvent when telemetry is absent", async () => {
    setupMocks();
    const req = createMockReq({ body: { ...validBody, telemetry: undefined } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(logTelemetryEvent).not.toHaveBeenCalled();
  });

  it("returns 200 for a submission containing a valid not-an-object suggestion", async () => {
    setupMocks();
    const req = createMockReq({
      body: {
        ...validBody,
        selectedObjectsID: [{ comment: "not_an_object", obstructs: false }],
      },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
  });

  it("returns 422 when a not-an-object box has obstructs true", async () => {
    setupMocks();
    const req = createMockReq({
      body: {
        ...validBody,
        selectedObjectsID: [{ comment: "not_an_object", obstructs: true, severity: 3 }],
      },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(422);
  });

  // Annotators do Objects, then Obstructions (4 Oct 2026): every suggestion
  // kept or marked not an object, and obstructs true or false on every real box
  describe("annotators (Objects and Obstructions)", () => {
    function setupAnnotator(image = ANNOTATOR_IMAGE) {
      const mocks = setupMocks({ userRole: "annotator" });
      mocks.imageCol.findOne.mockResolvedValue(image);
      return mocks;
    }
    const storedSet = (mocks) => mocks.annotationsCol.updateOne.mock.calls[0][1].$set;

    it("stores the true and false answers on real boxes, null on the Not an object box", async () => {
      const mocks = setupAnnotator();
      const res = createMockRes();
      await handler(createMockReq({ body: annotatorBody() }), res);

      expect(res._status).toBe(200);
      const $set = storedSet(mocks);
      expect($set.sceneLevel).toBeNull();
      expect($set.source).toBe("annotator");
      expect($set.selectedObjectsID.map((b) => b.obstructs)).toEqual([false, null]);
      expect($set.newObjects.map((b) => b.obstructs)).toEqual([true]);
      for (const box of [...$set.selectedObjectsID, ...$set.newObjects]) expect(box.severity).toBeNull();
    });

    it("returns 422 for a real box with no obstruction answer", async () => {
      const mocks = setupAnnotator();
      const body = annotatorBody();
      body.selectedObjectsID[0] = { ...body.selectedObjectsID[0], obstructs: null };
      const res = createMockRes();
      await handler(createMockReq({ body }), res);

      expect(res._status).toBe(422);
      expect(res._json.message).toBe("Every object must have an obstruction answer (obstructs: true or false).");
      expect(mocks.annotationsCol.updateOne).not.toHaveBeenCalled();
    });

    it("stores a Not an object box sent with obstructs true as null", async () => {
      const mocks = setupAnnotator();
      const body = annotatorBody();
      body.selectedObjectsID[1] = { ...body.selectedObjectsID[1], obstructs: true };
      const res = createMockRes();
      await handler(createMockReq({ body }), res);

      expect(res._status).toBe(200);
      const stored = storedSet(mocks).selectedObjectsID;
      expect(stored[1].obstructs).toBeNull();
      // The kept suggestion's own answer is kept
      expect(stored[0].obstructs).toBe(false);
    });

    it("stores severities and scene answers sent by the client as null", async () => {
      const mocks = setupAnnotator();
      const body = annotatorBody();
      body.sceneLevel = validBody.sceneLevel;
      body.selectedObjectsID[0] = { ...body.selectedObjectsID[0], severity: 4 };
      body.newObjects[0] = { ...body.newObjects[0], severity: 2 };
      const res = createMockRes();
      await handler(createMockReq({ body }), res);

      expect(res._status).toBe(200);
      const $set = storedSet(mocks);
      expect($set.sceneLevel).toBeNull();
      expect($set.selectedObjectsID[0]).toMatchObject({ obstructs: false, severity: null });
      expect($set.newObjects[0]).toMatchObject({ obstructs: true, severity: null });
    });

    it("returns 422 for a free-text category, checked after the role lookup and before the session", async () => {
      const mocks = setupAnnotator();
      const body = annotatorBody();
      body.newObjects[0] = { ...body.newObjects[0], comment: "truck" };
      const res = createMockRes();
      await handler(createMockReq({ body }), res);

      expect(res._status).toBe(422);
      expect(res._json.message).toBe("Every box must have a category from the list.");
      expect(mocks.usersCol.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ _id: expect.anything() }),
        { projection: { role: 1 } }
      );
      expect(mocks.sessionsCol.findOne).not.toHaveBeenCalled();
      expect(mocks.annotationsCol.updateOne).not.toHaveBeenCalled();
    });

    it("returns 422 when a visible suggestion is missing", async () => {
      const mocks = setupAnnotator();
      const body = annotatorBody();
      body.selectedObjectsID = body.selectedObjectsID.filter((b) => b.id !== "p2");
      const res = createMockRes();
      await handler(createMockReq({ body }), res);

      expect(res._status).toBe(422);
      expect(res._json.message).toBe("Every suggested box must be kept or marked not an object.");
      expect(mocks.annotationsCol.updateOne).not.toHaveBeenCalled();
    });

    it("returns 422 for a suggestion id that is not in the image's annotationList", async () => {
      const mocks = setupAnnotator();
      const body = annotatorBody();
      body.selectedObjectsID.push({ ...body.selectedObjectsID[0], id: "elsewhere" });
      const res = createMockRes();
      await handler(createMockReq({ body }), res);

      expect(res._status).toBe(422);
      expect(res._json.message).toBe("A suggested box does not belong to this image.");
      expect(mocks.annotationsCol.updateOne).not.toHaveBeenCalled();
    });

    it("allows a suggestion hidden by the confidence threshold to be missing", async () => {
      const hidden = { id: "p3", comment: "bench", confidence: 0.2, mark: rect(500, 500, 40, 40) };
      setupAnnotator({ ...ANNOTATOR_IMAGE, annotationList: [...ANNOTATOR_IMAGE.annotationList, hidden] });
      const res = createMockRes();
      await handler(createMockReq({ body: annotatorBody() }), res);

      expect(res._status).toBe(200);
    });
  });

  // Both roles (4 Oct 2026): marks normalized and clipped to the image
  describe("box geometry", () => {
    it("asks the Image lookup for width, height, annotationList, poolStatus, isReference and sidewalkAgreement", async () => {
      const mocks = setupMocks();
      await handler(createMockReq({ body: validBody }), createMockRes());

      expect(mocks.imageCol.findOne.mock.calls[0][1]).toEqual({
        projection: { city: 1, width: 1, height: 1, annotationList: 1, poolStatus: 1, isReference: 1, sidewalkAgreement: 1 },
      });
    });

    it("stores a contributor box drawn up and to the left with positive width and height", async () => {
      const mocks = setupMocks();
      mocks.imageCol.findOne.mockResolvedValue({ city: "makati", width: 1280, height: 960 });
      const body = { ...validBody, newObjects: [{ id: "n1", comment: "tree", obstructs: false, mark: rect(300, 200, -100, -50) }] };
      const res = createMockRes();
      await handler(createMockReq({ body }), res);

      expect(res._status).toBe(200);
      expect(mocks.annotationsCol.updateOne.mock.calls[0][1].$set.newObjects[0].mark).toEqual(rect(200, 150, 100, 50));
    });

    it("stores an annotator box past the image edge clipped to the image", async () => {
      const mocks = setupMocks({ userRole: "annotator" });
      mocks.imageCol.findOne.mockResolvedValue(ANNOTATOR_IMAGE);
      const body = annotatorBody();
      body.newObjects[0] = { ...body.newObjects[0], mark: rect(1250, 900, 100, 100) };
      const res = createMockRes();
      await handler(createMockReq({ body }), res);

      expect(res._status).toBe(200);
      expect(mocks.annotationsCol.updateOne.mock.calls[0][1].$set.newObjects[0].mark).toEqual(rect(1250, 900, 30, 60));
    });

    it("returns 422 for a box entirely outside the image", async () => {
      const mocks = setupMocks();
      mocks.imageCol.findOne.mockResolvedValue({ city: "makati", width: 1280, height: 960 });
      const body = { ...validBody, newObjects: [{ id: "n1", comment: "tree", obstructs: false, mark: rect(1400, 100, 50, 50) }] };
      const res = createMockRes();
      await handler(createMockReq({ body }), res);

      expect(res._status).toBe(422);
      expect(res._json.message).toBe("A box has no area inside the image.");
      expect(mocks.annotationsCol.updateOne).not.toHaveBeenCalled();
    });

    it("leaves the pipeline's initialState box alone", async () => {
      const mocks = setupMocks();
      mocks.imageCol.findOne.mockResolvedValue({ city: "makati", width: 1280, height: 960 });
      const initialState = { comment: "tree", mark: rect(10, 10, 20, 20) };
      const body = { ...validBody, selectedObjectsID: [{ id: "s1", comment: "tree", obstructs: false, initialState, mark: rect(40, 40, -20, -20) }] };
      await handler(createMockReq({ body }), createMockRes());

      const stored = mocks.annotationsCol.updateOne.mock.calls[0][1].$set.selectedObjectsID[0];
      expect(stored.initialState).toEqual(initialState);
      expect(stored.mark).toEqual(rect(20, 20, 20, 20));
    });
  });

  it("still returns 422 for a contributor with no sceneLevel", async () => {
    const mocks = setupMocks({ userRole: "user" });
    const req = createMockReq({ body: { ...validBody, sceneLevel: undefined } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(422);
    expect(mocks.usersCol.findOne).toHaveBeenCalled();
  });

  it("still requires a contributor's severity on an obstructing box", async () => {
    setupMocks({ userRole: "user" });
    const req = createMockReq({ body: { ...validBody, selectedObjectsID: [{ obstructs: true }] } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(422);
  });

  it("stores a contributor's sceneLevel and severities unchanged", async () => {
    const mocks = setupMocks({ userRole: "user" });
    const req = createMockReq({ body: validBody });
    const res = createMockRes();

    await handler(req, res);

    const $set = mocks.annotationsCol.updateOne.mock.calls[0][1].$set;
    expect($set.sceneLevel).toEqual(validBody.sceneLevel);
    expect($set.selectedObjectsID).toEqual(validBody.selectedObjectsID);
  });

  it("returns 500 when the role lookup throws", async () => {
    const mocks = setupMocks();
    mocks.usersCol.findOne.mockRejectedValue(new Error("db down"));
    const req = createMockReq({ body: validBody });
    const res = createMockRes();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await handler(req, res);
    errorSpy.mockRestore();

    expect(res._status).toBe(500);
    expect(mocks.annotationsCol.updateOne).not.toHaveBeenCalled();
  });

  // Sidewalk step on model-development images (6 Oct 2026)
  describe("sidewalk outline", () => {
    const DEV_IMAGE = { ...ANNOTATOR_IMAGE, poolStatus: "model_dev", isReference: false };
    const REF_IMAGE = { ...ANNOTATOR_IMAGE, poolStatus: "served", isReference: true };
    const SHAPE_MESSAGE = "A sidewalk shape is not a valid outline. Each shape needs at least three points and its edges must not cross.";
    const walk = (points) => ({ id: "w1", kind: "walk", points });

    function submitAs({ role = "annotator", image = DEV_IMAGE, sidewalkMask, body } = {}) {
      const mocks = setupMocks({ userRole: role });
      mocks.imageCol.findOne.mockResolvedValue(image);
      const payload = body ?? annotatorBody();
      if (sidewalkMask !== undefined) payload.sidewalkMask = sidewalkMask;
      const res = createMockRes();
      return handler(createMockReq({ body: payload }), res).then(() => ({ mocks, res }));
    }
    const stored = (mocks) => mocks.annotationsCol.updateOne.mock.calls[0][1].$set;

    it("stores a valid outline normalized: clamped to the image and rounded", async () => {
      const { mocks, res } = await submitAs({
        sidewalkMask: { noSidewalk: false, polygons: [walk([{ x: -5, y: 900.456 }, { x: 640.123, y: 500 }, { x: 1300, y: 960.4 }])] },
      });
      expect(res._status).toBe(200);
      expect(stored(mocks).sidewalkMask).toEqual({
        noSidewalk: false,
        polygons: [walk([{ x: 0, y: 900.46 }, { x: 640.12, y: 500 }, { x: 1280, y: 960 }])],
      });
    });

    it("returns 422 for an outline with a cut out, removed on 6 Oct 2026", async () => {
      const { mocks, res } = await submitAs({
        sidewalkMask: {
          noSidewalk: false,
          polygons: [
            walk([{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }]),
            { id: "c1", kind: "cutout", points: [{ x: 50, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 50, y: 100 }] },
          ],
        },
      });
      expect(res._status).toBe(422);
      expect(res._json.message).toBe(SHAPE_MESSAGE);
      expect(mocks.annotationsCol.updateOne).not.toHaveBeenCalled();
    });

    it("stores a valid No sidewalk outline", async () => {
      const { mocks, res } = await submitAs({ sidewalkMask: { noSidewalk: true, polygons: [] } });
      expect(res._status).toBe(200);
      expect(stored(mocks).sidewalkMask).toEqual({ noSidewalk: true, polygons: [] });
    });

    it("returns 422 for a missing outline, No sidewalk with shapes, a crossing shape, or a shape outside the image", async () => {
      const cases = [
        [undefined, "Sidewalk outline is missing."],
        [{ noSidewalk: true, polygons: [walk([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 50 }])] }, "Remove the sidewalk shapes or untick No sidewalk."],
        [{ noSidewalk: false, polygons: [walk([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }])] }, SHAPE_MESSAGE],
        // Far outside the image, every point clamps onto the same corner, leaving no area
        [{ noSidewalk: false, polygons: [walk([{ x: 5000, y: 5000 }, { x: 6000, y: 5000 }, { x: 6000, y: 6000 }])] }, SHAPE_MESSAGE],
      ];
      for (const [sidewalkMask, message] of cases) {
        const { mocks, res } = await submitAs({ sidewalkMask });
        expect(res._status).toBe(422);
        expect(res._json.message).toBe(message);
        expect(mocks.annotationsCol.updateOne).not.toHaveBeenCalled();
      }
    });

    it("stores null on a reference image, whatever the client sent", async () => {
      const { mocks, res } = await submitAs({
        image: REF_IMAGE,
        sidewalkMask: { noSidewalk: false, polygons: [walk([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 50 }])] },
      });
      expect(res._status).toBe(200);
      expect(stored(mocks).sidewalkMask).toBeNull();
    });

    // The 30 reference images flagged for outline agreement (6 Oct 2026)
    const AGREEMENT_IMAGE = { ...REF_IMAGE, sidewalkAgreement: true };

    it("stores a valid outline normalized on a flagged reference image", async () => {
      const { mocks, res } = await submitAs({
        image: AGREEMENT_IMAGE,
        sidewalkMask: { noSidewalk: false, polygons: [walk([{ x: -5, y: 100.456 }, { x: 640.123, y: 100 }, { x: 300, y: 1000 }])] },
      });
      expect(res._status).toBe(200);
      expect(stored(mocks).sidewalkMask).toEqual({
        noSidewalk: false,
        polygons: [walk([{ x: 0, y: 100.46 }, { x: 640.12, y: 100 }, { x: 300, y: 960 }])],
      });
    });

    it("returns 422 for a missing outline on a flagged reference image", async () => {
      const { mocks, res } = await submitAs({ image: AGREEMENT_IMAGE });
      expect(res._status).toBe(422);
      expect(res._json.message).toBe("Sidewalk outline is missing.");
      expect(mocks.annotationsCol.updateOne).not.toHaveBeenCalled();
    });

    it("writes no sidewalkMask field for a contributor on a flagged reference image", async () => {
      const { mocks, res } = await submitAs({
        role: "user",
        image: { city: "makati", width: 1280, height: 960, poolStatus: "served", isReference: true, sidewalkAgreement: true },
        body: { ...validBody, sidewalkMask: { noSidewalk: true, polygons: [] } },
      });
      expect(res._status).toBe(200);
      expect(stored(mocks)).not.toHaveProperty("sidewalkMask");
    });

    it("writes no sidewalkMask field for a contributor", async () => {
      const { mocks, res } = await submitAs({
        role: "user",
        image: { city: "makati", width: 1280, height: 960, poolStatus: "model_dev", isReference: false },
        body: { ...validBody, sidewalkMask: { noSidewalk: true, polygons: [] } },
      });
      expect(res._status).toBe(200);
      expect(stored(mocks)).not.toHaveProperty("sidewalkMask");
    });
  });
});
