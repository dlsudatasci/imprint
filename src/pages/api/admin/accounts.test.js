import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";
import { ObjectId } from "mongodb";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./accounts.js";

const TARGET_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";
const target = { _id: new ObjectId(TARGET_ID), username: "test_annotator", email: "t@example.com", role: "user", age: "20-24" };

function setup({ actorRole = "admin", targetDoc = target, annotationsPerUser = [], activeSessions = [] } = {}) {
  getServerSession.mockResolvedValue(mockAuthSession({ role: actorRole }));
  const users = createMockCollection({
    findOne: vi.fn().mockImplementation(async (filter) => {
      const id = String(filter._id);
      if (id === MOCK_USER_ID) return { _id: new ObjectId(MOCK_USER_ID), role: actorRole };
      if (targetDoc && id === String(targetDoc._id)) return targetDoc;
      return null;
    }),
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([
        { _id: new ObjectId(MOCK_USER_ID), username: "francis", email: "f@example.com", role: "admin", age: "25-29" },
        target,
      ]),
    }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
  });
  const cols = { users };
  for (const c of ["annotations", "sessions", "telemetry_logs", "nasa_tlx", "exit_surveys", "Image"]) {
    cols[c] = createMockCollection({ deleteMany: vi.fn().mockResolvedValue({ deletedCount: 2 }) });
  }
  cols.annotations.aggregate.mockReturnValue({ toArray: vi.fn().mockResolvedValue(annotationsPerUser) });
  cols.sessions.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue(activeSessions) });
  cols.Image.updateMany.mockResolvedValue({ modifiedCount: 3 });
  const db = createMockDb(cols);
  connectToDatabase.mockResolvedValue({ db });
  return { db, ...cols };
}

const post = (body) => createMockReq({ method: "POST", body });

beforeEach(() => vi.clearAllMocks());

describe("/api/admin/accounts", () => {
  it("returns 405 for other methods", async () => {
    const res = createMockRes();
    await handler(createMockReq({ method: "DELETE" }), res);
    expect(res._status).toBe(405);
  });

  it("returns 403 for non-admins", async () => {
    setup({ actorRole: "annotator" });
    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res._status).toBe(403);
  });

  it("lists every account with email, role, profile state and annotation count", async () => {
    const m = setup({ annotationsPerUser: [{ _id: TARGET_ID, n: 4 }], activeSessions: [{ userId: TARGET_ID }] });
    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res._status).toBe(200);
    expect(m.sessions.find.mock.calls[0][0]).toEqual({ status: "active" });
    const [admin, other] = res._json.accounts;
    expect(admin).toMatchObject({ username: "francis", roleLabel: "Admin", isSelf: true, editable: false, annotations: 0, activeSession: false });
    expect(other).toMatchObject({ id: TARGET_ID, email: "t@example.com", roleLabel: "Contributor", profileComplete: true, annotations: 4, editable: true, activeSession: true });
  });

  it("rejects an invalid account id", async () => {
    setup();
    const res = createMockRes();
    await handler(post({ action: "preview", userId: "nope" }), res);
    expect(res._status).toBe(400);
  });

  it("returns 404 for an unknown account", async () => {
    setup({ targetDoc: null });
    const res = createMockRes();
    await handler(post({ action: "preview", userId: TARGET_ID }), res);
    expect(res._status).toBe(404);
  });

  it("previews what a deletion would remove without deleting anything", async () => {
    const m = setup();
    m.annotations.countDocuments.mockResolvedValue(5);
    m.Image.countDocuments.mockResolvedValue(2);
    const res = createMockRes();
    await handler(post({ action: "preview", userId: TARGET_ID }), res);
    expect(res._status).toBe(200);
    expect(res._json.counts).toMatchObject({ annotations: 5, sessions: 0, telemetry_logs: 0, nasa_tlx: 0, exit_surveys: 0, referenceImages: 2 });
    for (const c of ["annotations", "sessions", "telemetry_logs", "nasa_tlx", "exit_surveys"]) expect(m[c].deleteMany).not.toHaveBeenCalled();
    expect(m.users.deleteOne).not.toHaveBeenCalled();
  });

  it("refuses to delete without the exact username", async () => {
    const m = setup();
    const res = createMockRes();
    await handler(post({ action: "delete", userId: TARGET_ID, confirmName: "test" }), res);
    expect(res._status).toBe(400);
    expect(m.users.deleteOne).not.toHaveBeenCalled();
  });

  it("refuses to delete your own account", async () => {
    const m = setup();
    const res = createMockRes();
    await handler(post({ action: "delete", userId: MOCK_USER_ID, confirmName: "francis" }), res);
    expect(res._status).toBe(400); // the self check runs before the admin check
    expect(m.users.deleteOne).not.toHaveBeenCalled();
  });

  it("refuses to delete another admin", async () => {
    const m = setup({ targetDoc: { ...target, role: "admin" } });
    const res = createMockRes();
    await handler(post({ action: "delete", userId: TARGET_ID, confirmName: "test_annotator" }), res);
    expect(res._status).toBe(403);
    expect(m.users.deleteOne).not.toHaveBeenCalled();
  });

  it("deletes the account and everything it recorded, then logs an anonymous audit event", async () => {
    const m = setup();
    const res = createMockRes();
    await handler(post({ action: "delete", userId: TARGET_ID, confirmName: "test_annotator" }), res);
    expect(res._status).toBe(200);

    for (const c of ["annotations", "sessions", "telemetry_logs", "nasa_tlx", "exit_surveys"]) {
      const filter = m[c].deleteMany.mock.calls[0][0];
      expect(filter.$or[0].userId.$in.map(String)).toEqual([TARGET_ID, TARGET_ID]);
      expect(filter.$or[1]).toEqual({ username: "test_annotator" });
    }
    const [imgFilter, imgUpdate] = m.Image.updateMany.mock.calls[0];
    expect(imgFilter["referenceGroundTruth.userId"].$in.map(String)).toEqual([TARGET_ID, TARGET_ID]);
    expect(imgUpdate.$pull.referenceGroundTruth.userId.$in.map(String)).toEqual([TARGET_ID, TARGET_ID]);
    expect(imgUpdate).not.toHaveProperty("$inc"); // annotationCount left as it is
    expect(m.users.deleteOne).toHaveBeenCalledWith({ _id: target._id });

    expect(res._json.removed).toEqual({ annotations: 2, sessions: 2, telemetry_logs: 2, nasa_tlx: 2, exit_surveys: 2, referenceImages: 3, users: 1 });

    const audit = m.telemetry_logs.insertOne.mock.calls[0][0];
    expect(audit).toMatchObject({ event: "ACCOUNT_DELETED", userId: MOCK_USER_ID, complete: true });
    expect(JSON.stringify(audit)).not.toContain(TARGET_ID);
    expect(JSON.stringify(audit)).not.toContain("test_annotator");
    expect(JSON.stringify(audit)).not.toContain("t@example.com");
  });

  it("reports an incomplete deletion if anything is left", async () => {
    const m = setup();
    m.sessions.countDocuments.mockResolvedValue(1);
    const res = createMockRes();
    await handler(post({ action: "delete", userId: TARGET_ID, confirmName: "test_annotator" }), res);
    expect(res._status).toBe(500);
    expect(res._json.left.sessions).toBe(1);
    expect(m.telemetry_logs.insertOne.mock.calls[0][0]).toMatchObject({ event: "ACCOUNT_DELETED", complete: false });
  });

  it("makes a contributor an annotator with pass 1 and logs the change", async () => {
    const m = setup();
    const res = createMockRes();
    await handler(post({ action: "role", userId: TARGET_ID, role: "annotator" }), res);
    expect(res._status).toBe(200);
    const [filter, update] = m.users.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: target._id });
    expect(update.$set).toMatchObject({ role: "annotator", annotatorPass: 1, annotatorActive: true });
    expect(m.telemetry_logs.insertOne.mock.calls[0][0]).toMatchObject({
      event: "ROLE_CHANGED", userId: MOCK_USER_ID, targetUserId: TARGET_ID, from: "user", to: "annotator",
    });
  });

  it("makes an annotator a contributor and clears the annotator fields", async () => {
    const m = setup({ targetDoc: { ...target, role: "annotator", annotatorPass: 1 } });
    const res = createMockRes();
    await handler(post({ action: "role", userId: TARGET_ID, role: "user" }), res);
    expect(res._status).toBe(200);
    expect(m.users.updateOne.mock.calls[0][1]).toMatchObject({ $set: { role: "user" }, $unset: { annotatorPass: "", annotatorActive: "" } });
  });

  it("refuses to change the role while the person has a session in progress", async () => {
    const m = setup();
    m.sessions.countDocuments.mockResolvedValue(1);
    const res = createMockRes();
    await handler(post({ action: "role", userId: TARGET_ID, role: "annotator" }), res);
    expect(res._status).toBe(409);
    const filter = m.sessions.countDocuments.mock.calls[0][0];
    expect(filter.status).toBe("active");
    expect(filter.userId.$in.map(String)).toEqual([TARGET_ID, TARGET_ID]);
    expect(m.users.updateOne).not.toHaveBeenCalled();
    expect(m.telemetry_logs.insertOne).not.toHaveBeenCalled();
  });

  it("refuses to make anyone an admin", async () => {
    const m = setup();
    const res = createMockRes();
    await handler(post({ action: "role", userId: TARGET_ID, role: "admin" }), res);
    expect(res._status).toBe(400);
    expect(m.users.updateOne).not.toHaveBeenCalled();
  });
});
