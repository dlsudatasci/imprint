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
    overallAccessibility: 4,
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
});
