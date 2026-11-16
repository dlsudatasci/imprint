import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "@/pages/api/notifications/seen.js";

/** POST /api/notifications/seen (S29, 16 Nov 2026): opening the bell marks its messages read. */
let users;
beforeEach(() => {
  vi.clearAllMocks();
  users = createMockCollection();
  connectToDatabase.mockResolvedValue({ db: createMockDb({ users }) });
  getServerSession.mockResolvedValue(mockAuthSession({ _id: MOCK_USER_ID }));
});

async function call(req = {}) {
  const res = createMockRes();
  await handler(createMockReq(req), res);
  return res;
}

describe("POST /api/notifications/seen", () => {
  it("sets notificationsSeenAt to now for the signed-in user only", async () => {
    const before = Date.now();
    const res = await call();
    expect(res._status).toBe(200);
    const [filter, update] = users.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: new ObjectId(MOCK_USER_ID) });
    expect(Object.keys(update.$set)).toEqual(["notificationsSeenAt"]);
    expect(update.$set.notificationsSeenAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("gives 401 signed out, and for a sign-in without an account id", async () => {
    getServerSession.mockResolvedValueOnce(null);
    expect((await call())._status).toBe(401);
    getServerSession.mockResolvedValueOnce(mockAuthSession({ _id: undefined }));
    expect((await call())._status).toBe(401);
    expect(users.updateOne).not.toHaveBeenCalled();
  });

  it("gives 405 for other methods", async () => {
    expect((await call({ method: "GET" }))._status).toBe(405);
  });

  it("gives 500 when the database fails", async () => {
    users.updateOne.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call())._status).toBe(500);
  });
});
