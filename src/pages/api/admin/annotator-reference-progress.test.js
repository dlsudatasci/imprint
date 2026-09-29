import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockReq,
  createMockRes,
  createMockCollection,
  createMockDb,
  mockAuthSession,
  MOCK_USER_ID,
} from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./annotator-reference-progress.js";

const ANNOTATOR_ID_1 = "bbbbbbbbbbbbbbbbbbbbbbbb";
const ANNOTATOR_ID_2 = "cccccccccccccccccccccccc";

function setupAdminMocks({
  refImageCount = 150,
  refImageIDs = [1, 2, 3],
  annotators = [],
  completionCounts = [],
} = {}) {
  getServerSession.mockResolvedValue(mockAuthSession({ role: "admin" }));

  const usersCol = createMockCollection({
    findOne: vi.fn().mockResolvedValue({
      _id: new ObjectId(MOCK_USER_ID),
      role: "admin",
    }),
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(annotators),
    }),
  });

  const imageCol = createMockCollection({
    countDocuments: vi.fn().mockResolvedValue(refImageCount),
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(
        refImageIDs.map((id) => ({ imageID: id }))
      ),
    }),
  });

  const annotationsCol = createMockCollection({
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(completionCounts),
    }),
  });

  const db = createMockDb({
    users: usersCol,
    Image: imageCol,
    annotations: annotationsCol,
  });

  connectToDatabase.mockResolvedValue({ db });
  return { db, usersCol, imageCol, annotationsCol };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/annotator-reference-progress", () => {
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

  it("returns 403 for non-admin users", async () => {
    getServerSession.mockResolvedValue(mockAuthSession({ role: "user" }));
    const usersCol = createMockCollection({
      findOne: vi.fn().mockResolvedValue({
        _id: new ObjectId(MOCK_USER_ID),
        role: "user",
      }),
    });
    const db = createMockDb({ users: usersCol });
    connectToDatabase.mockResolvedValue({ db });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(403);
  });

  it("returns correct counts when annotations exist", async () => {
    setupAdminMocks({
      refImageCount: 150,
      refImageIDs: [1, 2, 3, 4, 5],
      annotators: [
        { _id: new ObjectId(ANNOTATOR_ID_1), username: "annotator1" },
        { _id: new ObjectId(ANNOTATOR_ID_2), username: "annotator2" },
      ],
      completionCounts: [
        { _id: ANNOTATOR_ID_1, completed: 87 },
        { _id: ANNOTATOR_ID_2, completed: 45 },
      ],
    });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.referenceImageCount).toBe(150);
    expect(res._json.annotators).toHaveLength(2);

    // Sorted by percentage descending
    expect(res._json.annotators[0].username).toBe("annotator1");
    expect(res._json.annotators[0].completed).toBe(87);
    expect(res._json.annotators[0].total).toBe(150);
    expect(res._json.annotators[0].percentage).toBe(58);

    expect(res._json.annotators[1].username).toBe("annotator2");
    expect(res._json.annotators[1].completed).toBe(45);
    expect(res._json.annotators[1].percentage).toBe(30);
  });

  it("returns zero completion for annotators with no reference annotations", async () => {
    setupAdminMocks({
      refImageCount: 150,
      refImageIDs: [1, 2, 3],
      annotators: [
        { _id: new ObjectId(ANNOTATOR_ID_1), username: "annotator1" },
      ],
      completionCounts: [],
    });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.annotators).toHaveLength(1);
    expect(res._json.annotators[0].completed).toBe(0);
    expect(res._json.annotators[0].percentage).toBe(0);
  });

  it("returns empty annotators array when no annotators exist", async () => {
    setupAdminMocks({
      refImageCount: 150,
      refImageIDs: [1, 2, 3],
      annotators: [],
      completionCounts: [],
    });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.referenceImageCount).toBe(150);
    expect(res._json.annotators).toEqual([]);
  });
});
