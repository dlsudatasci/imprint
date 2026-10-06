import { describe, it, expect } from "vitest";
import {
  ROLE_FIELDS, ROLES, parseRolesCsv, parseExpectedCounts, validateRoleRows, planRoleUpdates, verifyAppliedRoles,
} from "./roleAssignment.mjs";
import { canServeImage } from "./annotationGet.js";

const HEADER = "imageID,imageName,source,city,group,difficulty,role";
const csv = (...lines) => [HEADER, ...lines].join("\n");

describe("ROLE_FIELDS", () => {
  it("has exactly the four Step 5 roles", () => {
    expect(ROLES).toEqual(["model_dev", "reference", "deployment", "reserve"]);
  });

  it("maps each role to the poolStatus and isReference that annotationGet expects", () => {
    // annotators: reference + model_dev; contributors: reference + deployment; nobody: reserve
    const who = (role) => [canServeImage(ROLE_FIELDS[role], true), canServeImage(ROLE_FIELDS[role], false)];
    expect(who("model_dev")).toEqual([true, false]);
    expect(who("reference")).toEqual([true, true]);
    expect(who("deployment")).toEqual([false, true]);
    expect(who("reserve")).toEqual([false, false]);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(ROLE_FIELDS)).toBe(true);
    expect(Object.isFrozen(ROLE_FIELDS.reference)).toBe(true);
  });
});

describe("parseRolesCsv", () => {
  it("reads imageName and role and ignores the other columns", () => {
    const rows = parseRolesCsv(csv("1,a.jpg,atlas3,laspinas,g1,0-1,model_dev", "2,b.jpg,mapillary,pasig,g2,4+,reserve"));
    expect(rows).toEqual([{ imageName: "a.jpg", role: "model_dev" }, { imageName: "b.jpg", role: "reserve" }]);
  });

  it("accepts Windows line endings and a trailing newline", () => {
    const rows = parseRolesCsv(csv("1,a.jpg,atlas3,laspinas,g1,0-1,reference").replace(/\n/g, "\r\n") + "\r\n");
    expect(rows).toEqual([{ imageName: "a.jpg", role: "reference" }]);
  });

  it("rejects a file without the needed columns", () => {
    expect(() => parseRolesCsv("imageID,name\n1,a.jpg")).toThrow(/imageName and role/);
  });

  it("rejects an empty file", () => {
    expect(() => parseRolesCsv("")).toThrow(/empty/);
  });

  it("rejects a row with the wrong number of columns", () => {
    expect(() => parseRolesCsv(csv("1,a.jpg,atlas3,laspinas,g1,model_dev"))).toThrow(/line 2/);
  });
});

describe("parseExpectedCounts", () => {
  it("parses role=count pairs", () => {
    expect(parseExpectedCounts("model_dev=1002,reference=150, deployment=525,reserve=1010")).toEqual({
      model_dev: 1002, reference: 150, deployment: 525, reserve: 1010,
    });
  });

  it("rejects unknown roles and bad numbers", () => {
    expect(() => parseExpectedCounts("unserved=5")).toThrow();
    expect(() => parseExpectedCounts("reference=many")).toThrow();
  });
});

describe("validateRoleRows", () => {
  const rows = [
    { imageName: "a.jpg", role: "model_dev" },
    { imageName: "b.jpg", role: "reference" },
    { imageName: "c.jpg", role: "deployment" },
    { imageName: "d.jpg", role: "reserve" },
  ];

  it("passes clean rows and counts them", () => {
    const { problems, counts, total } = validateRoleRows(rows, { reference: 1, reserve: 1 });
    expect(problems).toEqual([]);
    expect(counts).toEqual({ model_dev: 1, reference: 1, deployment: 1, reserve: 1 });
    expect(total).toBe(4);
  });

  it("flags unknown roles, duplicates, bad names and count mismatches", () => {
    const bad = [...rows, { imageName: "a.jpg", role: "deployment" }, { imageName: "e.png", role: "served" }];
    const { problems } = validateRoleRows(bad, { reference: 2 });
    expect(problems.some((p) => p.includes("duplicate imageName a.jpg"))).toBe(true);
    expect(problems.some((p) => p.includes('unknown role "served"'))).toBe(true);
    expect(problems.some((p) => p.includes('bad imageName "e.png"'))).toBe(true);
    expect(problems.some((p) => p.includes("expected 2 reference images, file has 1"))).toBe(true);
  });
});

describe("planRoleUpdates", () => {
  const rows = [
    { imageName: "a.jpg", role: "model_dev" },
    { imageName: "b.jpg", role: "reference" },
    { imageName: "c.jpg", role: "deployment" },
  ];
  const fresh = (name) => ({ imageName: name, poolStatus: "unserved", isReference: false });

  it("groups names by role when the database matches", () => {
    const { problems, byRole } = planRoleUpdates(rows, ["a.jpg", "b.jpg", "c.jpg"].map(fresh));
    expect(problems).toEqual([]);
    expect(byRole).toEqual({ model_dev: ["a.jpg"], reference: ["b.jpg"], deployment: ["c.jpg"], reserve: [] });
  });

  it("flags images missing from either side", () => {
    const { problems } = planRoleUpdates(rows, ["a.jpg", "b.jpg", "z.jpg"].map(fresh));
    expect(problems).toContain("not in the database: c.jpg");
    expect(problems).toContain("in the database but not in the roles file: z.jpg");
  });

  it("refuses when any image already has a role", () => {
    const db = ["a.jpg", "b.jpg"].map(fresh).concat({ imageName: "c.jpg", poolStatus: "served", isReference: false });
    const { problems } = planRoleUpdates(rows, db);
    expect(problems.some((p) => p.includes('not "unserved"') && p.includes("c.jpg"))).toBe(true);
  });

  it("flags duplicate names in the database", () => {
    const { problems } = planRoleUpdates(rows, ["a.jpg", "a.jpg", "b.jpg", "c.jpg"].map(fresh));
    expect(problems).toContain("the database holds duplicate imageNames");
  });
});

describe("verifyAppliedRoles", () => {
  const rows = [
    { imageName: "a.jpg", role: "model_dev" },
    { imageName: "b.jpg", role: "reference" },
    { imageName: "c.jpg", role: "reserve" },
  ];

  it("returns no mismatches when every image carries its role's fields", () => {
    const db = [
      { imageName: "a.jpg", poolStatus: "model_dev", isReference: false },
      { imageName: "b.jpg", poolStatus: "served", isReference: true },
      { imageName: "c.jpg", poolStatus: "reserve", isReference: false },
    ];
    expect(verifyAppliedRoles(rows, db)).toEqual([]);
  });

  it("lists images whose fields differ or that are missing", () => {
    const db = [
      { imageName: "a.jpg", poolStatus: "served", isReference: false },
      { imageName: "b.jpg", poolStatus: "served", isReference: false },
    ];
    expect(verifyAppliedRoles(rows, db)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });
});
