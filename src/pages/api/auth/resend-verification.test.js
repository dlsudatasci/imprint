import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { ObjectId } from "mongodb";
import { createMockReq, createMockRes, createMockCollection, createMockDb, mockAuthSession, MOCK_USER_ID } from "@/test-utils/api-helpers";

const mockSendMail = vi.fn().mockResolvedValue({ messageId: "test-id" });
vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("./[...nextauth]", () => ({ authOptions: {} }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
}));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import handler from "./resend-verification.js";

// POST /api/auth/resend-verification (S9, decided 21 Oct 2026)
const account = (overrides = {}) => ({
  _id: new ObjectId(MOCK_USER_ID),
  email: "new@example.com",
  username: "newuser",
  emailVerifiedAt: null,
  emailVerifySentAt: null,
  ...overrides,
});

function setup({ user = account(), claimed = 1, latest = null, signedIn = true } = {}) {
  getServerSession.mockResolvedValue(signedIn ? mockAuthSession() : null);
  const findOne = vi.fn().mockResolvedValueOnce(user).mockResolvedValueOnce(latest ?? user);
  const users = createMockCollection({
    findOne,
    updateOne: vi.fn().mockResolvedValueOnce({ modifiedCount: claimed }).mockResolvedValue({ modifiedCount: 1 }),
  });
  connectToDatabase.mockResolvedValue({ db: createMockDb({ users }) });
  return users;
}

const post = () => createMockReq({ method: "POST", body: {} });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/auth/resend-verification", () => {
  it("sends a new link, replacing the old one, when the last mail is over five minutes old", async () => {
    const users = setup();
    const res = createMockRes();
    const before = Date.now();
    await handler(post(), res);
    expect(res._status).toBe(200);

    const [filter, update] = users.updateOne.mock.calls[0];
    expect(filter._id).toEqual(new ObjectId(MOCK_USER_ID));
    expect(filter.emailVerifiedAt).toBeNull();
    // The wait is in the filter, so two clicks at once send one mail
    const cutoff = filter.$or[1].emailVerifySentAt.$lte.getTime();
    expect(filter.$or[0]).toEqual({ emailVerifySentAt: null });
    expect(cutoff).toBeGreaterThanOrEqual(before - 5 * 60 * 1000);
    expect(cutoff).toBeLessThanOrEqual(Date.now() - 5 * 60 * 1000);
    expect(update.$set.emailVerifyToken).toMatch(/^[0-9a-f]{64}$/);
    expect(update.$set.emailVerifySentAt).toBeInstanceOf(Date);
    expect(update.$set.emailVerifyExpire.getTime() - update.$set.emailVerifySentAt.getTime()).toBe(24 * 60 * 60 * 1000);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe("new@example.com");
    expect(mail.subject).toBe("Confirm your email for IMPRINT");
    const token = /token=([0-9a-f]{64})/.exec(mail.html)[1];
    expect(crypto.createHash("sha256").update(token).digest("hex")).toBe(update.$set.emailVerifyToken);
  });

  it("allows at most one mail per five minutes, saying how long to wait", async () => {
    const sentAt = new Date(Date.now() - 60 * 1000);
    setup({ user: account({ emailVerifySentAt: sentAt }), claimed: 0 });
    const res = createMockRes();
    await handler(post(), res);
    expect(res._status).toBe(429);
    expect(res._json.retryAfter).toBeGreaterThan(230);
    expect(res._json.retryAfter).toBeLessThanOrEqual(240);
    expect(res._headers["Retry-After"]).toBe(String(res._json.retryAfter));
    expect(res._json.message).toBe("You can ask for another link in 4 minutes.");
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("sends nothing to an address that is already confirmed", async () => {
    const users = setup({ user: account({ emailVerifiedAt: new Date("2026-10-24") }) });
    const res = createMockRes();
    await handler(post(), res);
    expect(res._status).toBe(409);
    expect(res._json.code).toBe("used");
    expect(users.updateOne).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("reports confirmed when the address was confirmed while the request ran", async () => {
    setup({ claimed: 0, latest: account({ emailVerifiedAt: new Date() }) });
    const res = createMockRes();
    await handler(post(), res);
    expect(res._status).toBe(409);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("clears the send time when the mail fails, so the person can retry at once", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("smtp down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const users = setup();
    const res = createMockRes();
    await handler(post(), res);
    errorSpy.mockRestore();
    expect(res._status).toBe(502);
    expect(users.updateOne.mock.calls[1]).toEqual([{ _id: new ObjectId(MOCK_USER_ID) }, { $set: { emailVerifySentAt: null } }]);
  });

  it("is for signed-in people only, about their own account", async () => {
    setup({ signedIn: false });
    const res = createMockRes();
    await handler(post(), res);
    expect(res._status).toBe(401);

    setup({ user: null });
    const res2 = createMockRes();
    await handler(post(), res2);
    expect(res2._status).toBe(404);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("returns 405 for other methods", async () => {
    const res = createMockRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res._status).toBe(405);
  });
});
