import { describe, it, expect } from "vitest";
import { deletionSummary, roleChangeCopy, deleteCopy } from "./accountDialogs";

describe("deletionSummary", () => {
  it("lists every collection in a fixed order with singular and plural wording", () => {
    const rows = deletionSummary({ annotations: 1, sessions: 2, telemetry_logs: 1200, nasa_tlx: 0, exit_surveys: 1, referenceImages: 3 });
    expect(rows.map((r) => r.text)).toEqual([
      "1 annotation",
      "2 sessions",
      "1,200 activity log entries",
      "0 NASA-TLX responses",
      "1 exit survey response",
      "3 reference image answer key entries",
    ]);
  });

  it("treats missing counts as zero", () => {
    expect(deletionSummary().every((r) => r.n === 0)).toBe(true);
    expect(deletionSummary()).toHaveLength(6);
  });
});

describe("roleChangeCopy", () => {
  it("offers annotator to a contributor", () => {
    const c = roleChangeCopy({ username: "rans_test", role: "user" });
    expect(c).toMatchObject({ nextRole: "annotator", title: "Make rans_test an annotator?", confirmLabel: "Make annotator" });
    expect(c.description).toContain("model-development and reference images");
  });

  it("offers contributor to an annotator, and falls back to the email", () => {
    const c = roleChangeCopy({ email: "t@example.com", role: "annotator" });
    expect(c).toMatchObject({ nextRole: "user", title: "Make t@example.com a contributor?", confirmLabel: "Make contributor" });
    expect(c.description).toContain("reference and deployment images");
  });

  it("treats a missing role as contributor", () => {
    expect(roleChangeCopy({ username: "x" }).nextRole).toBe("annotator");
  });
});

describe("deleteCopy", () => {
  it("asks for the username, or the email when there is none", () => {
    expect(deleteCopy({ username: "rans_test", email: "t@example.com" })).toMatchObject({ expected: "rans_test", typeLabel: "Type rans_test to confirm" });
    expect(deleteCopy({ email: "t@example.com" }).expected).toBe("t@example.com");
  });

  it("uses no em dashes or semicolons in any dialog text", () => {
    const texts = [
      ...Object.values(deleteCopy({ username: "a" })),
      ...Object.values(roleChangeCopy({ username: "a", role: "user" })),
      ...Object.values(roleChangeCopy({ username: "a", role: "annotator" })),
      ...deletionSummary().map((r) => r.text),
    ].join(" ");
    expect(texts).not.toMatch(/[—;]/);
  });
});
