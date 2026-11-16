import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ObjectId } from "mongodb";
import { createMockReq, createMockRes, createMockCollection, createMockDb } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import { unsubscribeToken } from "@/util/emailLinks.mjs";
import handler from "@/pages/api/email/unsubscribe.js";

/** POST /api/email/unsubscribe (S29, 16 Nov 2026), from the signed link, with no sign-in. */
const SECRET = "test-secret";
const USER = "aaaaaaaaaaaaaaaaaaaaaaaa";
let users;

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", SECRET);
  users = createMockCollection();
  connectToDatabase.mockResolvedValue({ db: createMockDb({ users }) });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const token = unsubscribeToken(USER, SECRET);

async function call(req) {
  const res = createMockRes();
  await handler(createMockReq(req), res);
  return res;
}

describe("POST /api/email/unsubscribe", () => {
  it("sets emailOptOutAt for a good token", async () => {
    const res = await call({ body: { u: USER, t: token } });
    expect(res._status).toBe(200);
    expect(users.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = users.updateOne.mock.calls[0];
    expect(filter._id).toEqual(new ObjectId(USER));
    expect(update.$set.emailOptOutAt).toBeInstanceOf(Date);
  });

  it("unsets it with on: true, to turn the emails back on", async () => {
    const res = await call({ body: { u: USER, t: token, on: true } });
    expect(res._status).toBe(200);
    expect(users.updateOne.mock.calls[0][1]).toEqual({ $unset: { emailOptOutAt: "" } });
    expect(res._json.emailsOn).toBe(true);
  });

  it("gives 400 for a bad token and changes nothing", async () => {
    for (const body of [{ u: USER, t: "0".repeat(64) }, { u: "bbbbbbbbbbbbbbbbbbbbbbbb", t: token }, { u: USER }, {}, { u: "x", t: token }]) {
      const res = await call({ body });
      expect(res._status).toBe(400);
    }
    expect(users.updateOne).not.toHaveBeenCalled();
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it("gives 400 when no secret is set, even for a token that was good", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    const res = await call({ body: { u: USER, t: token } });
    expect(res._status).toBe(400);
    expect(users.updateOne).not.toHaveBeenCalled();
  });

  it("works as the one-click form (RFC 8058), with u and t in the query", async () => {
    const res = await call({ query: { u: USER, t: token }, body: { "List-Unsubscribe": "One-Click" } });
    expect(res._status).toBe(200);
    expect(users.updateOne.mock.calls[0][1].$set.emailOptOutAt).toBeInstanceOf(Date);
  });

  it("answers with no account details", async () => {
    users.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    const res = await call({ body: { u: USER, t: token } });
    expect(Object.keys(res._json).sort()).toEqual(["emailsOn", "ok"]);
    expect(JSON.stringify(res._json)).not.toContain(USER);
  });

  it("refuses other methods with 405", async () => {
    const res = await call({ method: "GET", query: { u: USER, t: token } });
    expect(res._status).toBe(405);
    expect(users.updateOne).not.toHaveBeenCalled();
  });

  it("gives 500 when the database fails", async () => {
    users.updateOne.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call({ body: { u: USER, t: token } });
    expect(res._status).toBe(500);
  });
});
