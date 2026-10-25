import { describe, it, expect } from "vitest";
import { signupRole, signupPilot, newAccountFields } from "./newAccountRole";
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

// SIGNUP_PILOT server switch (S11, 23 Oct 2026)
describe("signupPilot", () => {
  it("is on only for exactly SIGNUP_PILOT=true", () => {
    expect(signupPilot({ SIGNUP_PILOT: "true" })).toBe(true);
    expect(signupPilot({ SIGNUP_PILOT: "true", SIGNUP_ROLE: "annotator" })).toBe(true);
  });

  it("is off for a missing setting, an empty one or anything else", () => {
    for (const value of [undefined, "", "TRUE", "True", "1", "yes", "on", " true", "true ", "false"]) {
      expect(signupPilot({ SIGNUP_PILOT: value })).toBe(false);
    }
    expect(signupPilot({})).toBe(false);
  });
});

describe("newAccountFields with SIGNUP_PILOT", () => {
  it("marks a new contributor as a pilot account while it is on", () => {
    expect(newAccountFields({ SIGNUP_PILOT: "true" })).toEqual({ role: "user", isPilot: true });
    // admin is never given, so this is still a contributor and still a pilot account
    expect(newAccountFields({ SIGNUP_PILOT: "true", SIGNUP_ROLE: "admin" })).toEqual({ role: "user", isPilot: true });
  });

  it("writes no isPilot field while it is off or set to anything else", () => {
    for (const value of [undefined, "", "TRUE", "1", "false"]) {
      const fields = newAccountFields({ SIGNUP_PILOT: value });
      expect(fields).toEqual({ role: "user" });
      expect(fields).not.toHaveProperty("isPilot");
    }
  });

  it("never marks an annotator, even with SIGNUP_ROLE=annotator and SIGNUP_PILOT=true", () => {
    const fields = newAccountFields({ SIGNUP_ROLE: "annotator", SIGNUP_PILOT: "true" });
    expect(fields).toEqual({ role: "annotator", annotatorPass: 1, annotatorActive: true });
    expect(fields).not.toHaveProperty("isPilot");
  });
});
