import { describe, it, expect } from "vitest";
import { takesContributorInstruments, CONTRIBUTOR_ONLY_MESSAGE } from "./contributorInstruments.js";

describe("takesContributorInstruments", () => {
  it("is false for annotators (3 Oct 2026)", () => {
    expect(takesContributorInstruments("annotator")).toBe(false);
  });

  it("is true for contributors, admins and a missing role", () => {
    for (const role of ["user", "admin", undefined, null]) {
      expect(takesContributorInstruments(role)).toBe(true);
    }
  });
});

describe("CONTRIBUTOR_ONLY_MESSAGE", () => {
  it("has no em dash and no semicolon", () => {
    expect(CONTRIBUTOR_ONLY_MESSAGE).toBeTruthy();
    expect(CONTRIBUTOR_ONLY_MESSAGE).not.toMatch(/[—;]/);
  });
});
