import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { SESSION_USER_FIELDS, NEVER_IN_SESSION, toSessionUser, withoutPrivateFields } from "./sessionUser";

/** The login cookie's copy of a person (S13, 26 Oct 2026). */
describe("sessionUser", () => {
  it("lists the fields the app reads, and none it must never send", () => {
    expect([...SESSION_USER_FIELDS].sort()).toEqual([
      "_id", "email", "emailVerifiedAt", "hasCompletedTutorial", "image", "isNewGoogleUser",
      "isProfileIncomplete", "name", "needsEmailVerification", "role", "username",
    ]);
    for (const field of NEVER_IN_SESSION) expect(SESSION_USER_FIELDS).not.toContain(field);
    for (const field of ["age", "activities", "hashedPassword", "totalAnnotations", "isPilot", "occupation"]) {
      expect(SESSION_USER_FIELDS).not.toContain(field);
    }
  });

  it("keeps only the listed fields, with _id as a string", () => {
    const id = new ObjectId("6ac4cfd8d52b60835699bbc4");
    const out = toSessionUser({
      _id: id, username: "rans_test", email: "r@example.com", role: "user", age: "20-24",
      hashedPassword: "$2b$10$x", activities: [{ activity: "x" }], isPilot: true, totalAnnotations: 40,
      emailVerifiedAt: null, isProfileIncomplete: false,
    });
    expect(out).toEqual({
      _id: "6ac4cfd8d52b60835699bbc4", username: "rans_test", email: "r@example.com", role: "user",
      emailVerifiedAt: null, isProfileIncomplete: false,
    });
  });

  it("leaves out a field that is undefined, keeps false and null, and is idempotent", () => {
    const once = toSessionUser({ username: "a", image: undefined, hasCompletedTutorial: false, emailVerifiedAt: null });
    expect(once).toEqual({ username: "a", hasCompletedTutorial: false, emailVerifiedAt: null });
    expect(Object.keys(once)).not.toContain("image");
    expect(toSessionUser(once)).toEqual(once);
  });

  it("returns anything that is not an object as it is", () => {
    for (const value of [undefined, null, "x", 3]) expect(toSessionUser(value)).toBe(value);
  });

  it("removes the never-sent fields without changing the input", () => {
    const user = { username: "a", hashedPassword: "h", activities: [], emailVerifyToken: "t", resetPasswordToken: "r" };
    expect(withoutPrivateFields(user)).toEqual({ username: "a" });
    expect(user.hashedPassword).toBe("h");
  });
});
