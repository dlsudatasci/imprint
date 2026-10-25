import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { createMockCollection, createMockDb } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth", () => ({ default: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import { authOptions } from "./[...nextauth].js";

/**
 * The sign-in callbacks' part in email verification (S9, decided 21 Oct 2026):
 * the needsEmailVerification flag the pages route by, its refresh from the
 * database, and what the browser's session leaves out. The annotation routes
 * check the database themselves (annotationGet, annotationSubmit and
 * annotationComplete tests).
 */
const { jwt, session: sessionCallback, signIn } = authOptions.callbacks;
const USER_ID = "6ac4cfd8d52b60835699bbc4";

function db(findOne) {
  const users = createMockCollection({ findOne: vi.fn(findOne) });
  connectToDatabase.mockResolvedValue({ db: createMockDb({ users }) });
  return users;
}

beforeEach(() => vi.clearAllMocks());

describe("jwt callback: needsEmailVerification", () => {
  const passwordUser = (extra) => ({ _id: new ObjectId(USER_ID), username: "newuser", role: "user", age: "20-24", ...extra });

  it("is true for a password contributor whose address is not confirmed", async () => {
    const token = await jwt({ token: {}, user: passwordUser({ emailVerifiedAt: null }), account: { provider: "credentials" } });
    expect(token.user.needsEmailVerification).toBe(true);
  });

  it("is false once confirmed, and for annotators and admins", async () => {
    for (const extra of [{ emailVerifiedAt: new Date() }, { role: "annotator", emailVerifiedAt: null }, { role: "admin" }]) {
      const token = await jwt({ token: {}, user: passwordUser(extra), account: { provider: "credentials" } });
      expect(token.user.needsEmailVerification).toBe(false);
    }
  });

  it("is false for a Google sign-in, new or returning: Google has verified the address", async () => {
    db(async () => null);
    const fresh = await jwt({ token: {}, user: { email: "g@example.com", name: "G" }, account: { provider: "google" } });
    expect(fresh.user.needsEmailVerification).toBe(false);

    db(async () => ({ _id: new ObjectId(USER_ID), username: "guser", email: "g@example.com" }));
    const back = await jwt({ token: {}, user: { email: "G@Example.com" }, account: { provider: "google" } });
    expect(back.user.needsEmailVerification).toBe(false);
  });

  it("looks a Google account up by its address lowercased", async () => {
    const users = db(async () => null);
    await jwt({ token: {}, user: { email: " G@Example.COM" }, account: { provider: "google" } });
    expect(users.findOne).toHaveBeenCalledWith({ email: "g@example.com" });
  });
});

describe("jwt callback: refreshing after the address is confirmed", () => {
  const stale = () => ({ user: { _id: USER_ID, username: "newuser", role: "user", needsEmailVerification: true } });

  it("reads the database and clears the flag when it says confirmed", async () => {
    const users = db(async () => ({ role: "user", emailVerifiedAt: new Date("2026-10-25") }));
    const token = await jwt({ token: stale(), trigger: "update", session: { emailVerified: true } });
    expect(users.findOne).toHaveBeenCalledWith({ _id: new ObjectId(USER_ID) }, { projection: { role: 1, emailVerifiedAt: 1 } });
    expect(token.user.needsEmailVerification).toBe(false);
  });

  it("keeps the flag when the browser says confirmed but the database does not", async () => {
    db(async () => ({ role: "user", emailVerifiedAt: null }));
    const token = await jwt({ token: stale(), trigger: "update", session: { emailVerified: true } });
    expect(token.user.needsEmailVerification).toBe(true);
  });

  it("keeps the flag when the database cannot be read", async () => {
    connectToDatabase.mockRejectedValue(new Error("down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const token = await jwt({ token: stale(), trigger: "update", session: { emailVerified: true } });
    errorSpy.mockRestore();
    expect(token.user.needsEmailVerification).toBe(true);
  });
});

describe("session callback", () => {
  it("never sends the link's hash or timing to the browser, and keeps the flag", async () => {
    const out = await sessionCallback({
      session: {},
      token: {
        user: {
          _id: USER_ID, username: "newuser", needsEmailVerification: true, emailVerifiedAt: null,
          emailVerifyToken: "a".repeat(64), emailVerifyExpire: new Date(), emailVerifySentAt: new Date(), hashedPassword: "x",
        },
      },
    });
    for (const field of ["emailVerifyToken", "emailVerifyExpire", "emailVerifySentAt", "hashedPassword"]) {
      expect(out.user).not.toHaveProperty(field);
    }
    expect(out.user.needsEmailVerification).toBe(true);
  });
});

describe("signIn callback", () => {
  it("compares the Google address lowercased with the password accounts", async () => {
    const users = db(async () => ({ hashedPassword: "x" }));
    const result = await signIn({ user: { email: "Pw.User@Example.com" }, account: { provider: "google" } });
    expect(users.findOne).toHaveBeenCalledWith({ email: "pw.user@example.com" }, { projection: { hashedPassword: 1 } });
    expect(result).toBe("/login?error=UsePassword");
  });
});
