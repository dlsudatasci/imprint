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
    const req = createMockReq({ body: validBody });
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

  // Annotators record boxes, categories and Yes/No only (3 Oct 2026)
  describe("annotators", () => {
    const annotatorBody = {
      imageID: 42,
      selectedObjectsID: [{ comment: "tree", obstructs: true }],
      newObjects: [{ comment: "car", obstructs: false }],
      currentAnnotationCount: 1,
    };

    it("accepts a submission with no sceneLevel and no severity", async () => {
      const mocks = setupMocks({ userRole: "annotator" });
      const req = createMockReq({ body: annotatorBody });
      const res = createMockRes();

      await handler(req, res);

      expect(res._status).toBe(200);
      const $set = mocks.annotationsCol.updateOne.mock.calls[0][1].$set;
      expect($set.sceneLevel).toBeNull();
      expect($set.source).toBe("annotator");
      for (const box of [...$set.selectedObjectsID, ...$set.newObjects]) expect(box.severity).toBeNull();
    });

    it("stores scene answers and severities sent by an old client as null", async () => {
      const mocks = setupMocks({ userRole: "annotator" });
      const req = createMockReq({
        body: {
          ...validBody,
          selectedObjectsID: [{ comment: "tree", obstructs: true, severity: 4 }],
          newObjects: [{ comment: "car", obstructs: false, severity: 2 }],
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res._status).toBe(200);
      const $set = mocks.annotationsCol.updateOne.mock.calls[0][1].$set;
      expect($set.sceneLevel).toBeNull();
      expect($set.selectedObjectsID).toEqual([{ comment: "tree", obstructs: true, severity: null }]);
      expect($set.newObjects).toEqual([{ comment: "car", obstructs: false, severity: null }]);
      expect($set.servedModelVersion).toBeNull();
    });

    it("still returns 422 when a box has no Yes or No", async () => {
      const mocks = setupMocks({ userRole: "annotator" });
      const req = createMockReq({ body: { ...annotatorBody, newObjects: [{ comment: "car" }] } });
      const res = createMockRes();

      await handler(req, res);

      expect(res._status).toBe(422);
      expect(mocks.annotationsCol.updateOne).not.toHaveBeenCalled();
    });

    it("reads the role from the database before validating", async () => {
      const mocks = setupMocks({ userRole: "annotator" });
      const req = createMockReq({ body: { ...annotatorBody, newObjects: [{ comment: "car" }] } });
      const res = createMockRes();

      await handler(req, res);

      // The users lookup ran even though validation then refused the body
      expect(mocks.usersCol.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ _id: expect.anything() }),
        { projection: { role: 1 } }
      );
      expect(mocks.sessionsCol.findOne).not.toHaveBeenCalled();
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
});
