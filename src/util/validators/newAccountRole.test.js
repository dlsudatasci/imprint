import { describe, it, expect } from "vitest";
import { newAccountRole, registerAsAnnotator } from "./newAccountRole";

// Local testing only (6 Oct 2026)
const local = { NODE_ENV: "development", MONGODB_DB: "imprint_dev", REGISTER_AS_ANNOTATOR: "true" };

describe("newAccountRole", () => {
  it("makes new accounts annotators when REGISTER_AS_ANNOTATOR is \"true\" on a local database", () => {
    expect(registerAsAnnotator(local)).toBe(true);
    expect(newAccountRole(local)).toBe("annotator");
    expect(newAccountRole({ ...local, NODE_ENV: "test" })).toBe("annotator");
  });

  it("makes new accounts contributors when the setting is missing or anything other than \"true\"", () => {
    for (const value of [undefined, "", "1", "yes", "TRUE", "false"]) {
      expect(newAccountRole({ ...local, REGISTER_AS_ANNOTATOR: value })).toBe("user");
    }
  });

  it("is never on in a production build, so live sign-ups stay contributors", () => {
    expect(newAccountRole({ ...local, NODE_ENV: "production" })).toBe("user");
  });

  it("is never on against the study database, even from a local server", () => {
    expect(newAccountRole({ ...local, MONGODB_DB: "imprint" })).toBe("user");
  });
});
