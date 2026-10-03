import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("../auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./[id].js";

const VALID_ID = "cccccccccccccccccccccccc";

function setupMocks({ hasSession = true, annotation = undefined, image = undefined, role = "user" } = {}) {
  getServerSession.mockResolvedValue(
    hasSession ? mockAuthSession({ _id: MOCK_USER_ID }) : null
  );

  const defaultAnnotation = {
    _id: VALID_ID,
    userId: MOCK_USER_ID,
    imageID: 42,
    selectedObjectsID: [],
    newObjects: [],
    sceneLevel: {},
    username: "testuser",
    date: new Date(),
  };

  const defaultImage = {
    imageID: 42,
    city: "makati",
    url: "https://example.com/img.jpg",
    annotationList: [],
  };

  const annotationsCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue(annotation === undefined ? defaultAnnotation : annotation),
  });
  const imageCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue(image === undefined ? defaultImage : image),
  });
  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({ _id: MOCK_USER_ID, role }),
  });
  const db = createMockDb({ annotations: annotationsCol, Image: imageCol, users: usersCol });
  connectToDatabase.mockResolvedValue({ db });
  return { db, annotationsCol, imageCol, usersCol };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("GET /api/getAnnotation/[id]", () => {
  it("returns annotation and image data", async () => {
    setupMocks();
    const req = createMockReq({ method: "GET", query: { id: VALID_ID } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._json.imageID).toBe(42);
    expect(res._json.city).toBe("makati");
    expect(res._json.url).toBe("https://example.com/img.jpg");
  });

  it("returns 401 when not authenticated", async () => {
    setupMocks({ hasSession: false });
    const req = createMockReq({ method: "GET", query: { id: VALID_ID } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 400 for invalid ObjectId", async () => {
    setupMocks();
    const req = createMockReq({ method: "GET", query: { id: "not-valid" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 for missing id", async () => {
    setupMocks();
    const req = createMockReq({ method: "GET", query: {} });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 404 when annotation not found", async () => {
    setupMocks({ annotation: null });
    const req = createMockReq({ method: "GET", query: { id: VALID_ID } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  it("returns 404 when image not found", async () => {
    setupMocks({ image: null });
    const req = createMockReq({ method: "GET", query: { id: VALID_ID } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  describe("suggestions on reference images", () => {
    const suggestions = [{ id: "atlas-0", comment: "car" }];
    const refImage = { imageID: 42, city: "makati", url: "/corpus-images/x.jpg", isReference: true, annotationList: suggestions };
    const devImage = { imageID: 42, city: "makati", url: "/corpus-images/x.jpg", isReference: false, annotationList: suggestions };

    it("keeps them for an annotator reopening a reference annotation (decided 1 Oct 2026)", async () => {
      setupMocks({ image: refImage, role: "annotator" });
      const res = createMockRes();
      await handler(createMockReq({ method: "GET", query: { id: VALID_ID } }), res);
      expect(res._json.detectedObjects).toEqual(suggestions);
    });

    it("keeps them for a contributor on a reference image", async () => {
      setupMocks({ image: refImage, role: "user" });
      const res = createMockRes();
      await handler(createMockReq({ method: "GET", query: { id: VALID_ID } }), res);
      expect(res._json.detectedObjects).toEqual(suggestions);
    });

    it("keeps them for an annotator on a model-dev image", async () => {
      const mocks = setupMocks({ image: devImage, role: "annotator" });
      const res = createMockRes();
      await handler(createMockReq({ method: "GET", query: { id: VALID_ID } }), res);
      expect(res._json.detectedObjects).toEqual(suggestions);
      expect(mocks.usersCol.findOne).not.toHaveBeenCalled();
    });
  });

  it("returns 405 for non-GET methods", async () => {
    const req = createMockReq({ method: "POST", query: { id: VALID_ID } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});
