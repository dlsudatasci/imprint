import { describe, it, expect } from "vitest";
import { signupRole, newAccountFields } from "./newAccountRole";
import { roleUpdate } from "./accountAdmin";

// SIGNUP_ROLE server switch (6 Oct 2026)
describe("signupRole", () => {
  it("is annotator for SIGNUP_ROLE=annotator, on the live site and the study database too", () => {
    expect(signupRole({ SIGNUP_ROLE: "annotator" })).toBe("annotator");
    expect(signupRole({ SIGNUP_ROLE: "annotator", NODE_ENV: "production", MONGODB_DB: "imprint" })).toBe("annotator");
  });

  it("is user for a missing setting or anything other than exactly annotator", () => {
    for (const value of [undefined, "", "user", "Annotator", "admin", "true"]) {
      expect(signupRole({ SIGNUP_ROLE: value })).toBe("user");
    }
    expect(signupRole({})).toBe("user");
  });

  it("ignores the old REGISTER_AS_ANNOTATOR setting", () => {
    expect(signupRole({ REGISTER_AS_ANNOTATOR: "true", NODE_ENV: "development", MONGODB_DB: "imprint_dev" })).toBe("user");
  });
});

describe("newAccountFields", () => {
  it("gives annotators the same fields the admin Accounts tab sets", () => {
    const fields = newAccountFields({ SIGNUP_ROLE: "annotator" });
    expect(fields).toEqual({ role: "annotator", annotatorPass: 1, annotatorActive: true });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- updatedAt is set by the caller
    const { updatedAt, ...adminFields } = roleUpdate("annotator").$set;
    expect(fields).toEqual(adminFields);
  });

  it("gives contributors only role user", () => {
    expect(newAccountFields({})).toEqual({ role: "user" });
    expect(newAccountFields({ SIGNUP_ROLE: "admin" })).toEqual({ role: "user" });
  });
});
