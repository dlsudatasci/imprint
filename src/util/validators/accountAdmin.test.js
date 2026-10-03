import { describe, it, expect } from "vitest";
import {
  EDITABLE_ROLES, ROLE_LABELS, USER_DATA_COLLECTIONS,
  accountLabel, roleOf, checkAccountAction, roleUpdate, summarizeAccount,
} from "./accountAdmin.js";

const ADMIN_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const contributor = { _id: "bbbbbbbbbbbbbbbbbbbbbbbb", username: "rans_test", email: "t@example.com", role: "user" };

describe("constants", () => {
  it("lets admins switch only between contributor and annotator", () => {
    expect(EDITABLE_ROLES).toEqual(["user", "annotator"]);
    expect(ROLE_LABELS.user).toBe("Contributor");
  });

  it("deletes every collection that stores a userId, apart from users and Image", () => {
    expect([...USER_DATA_COLLECTIONS].sort()).toEqual(["annotations", "exit_surveys", "nasa_tlx", "sessions", "telemetry_logs"]);
  });
});

describe("accountLabel and roleOf", () => {
  it("uses the username, falling back to the email", () => {
    expect(accountLabel(contributor)).toBe("rans_test");
    expect(accountLabel({ email: "x@y.z" })).toBe("x@y.z");
    expect(accountLabel(null)).toBe("");
  });

  it("treats a missing role as contributor", () => {
    expect(roleOf({})).toBe("user");
    expect(roleOf({ role: "annotator" })).toBe("annotator");
  });
});

describe("checkAccountAction", () => {
  const ok = (args) => checkAccountAction({ actorId: ADMIN_ID, target: contributor, ...args });

  it("rejects unknown actions", () => {
    expect(ok({ action: "ban" })).toMatchObject({ ok: false, status: 400 });
  });

  it("returns 404 when the account does not exist", () => {
    expect(checkAccountAction({ actorId: ADMIN_ID, target: null, action: "preview" })).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses to act on your own account", () => {
    const self = { ...contributor, _id: ADMIN_ID, role: "user" };
    for (const action of ["preview", "delete", "role"]) {
      expect(checkAccountAction({ actorId: ADMIN_ID, target: self, action, confirmName: "rans_test", role: "annotator" }))
        .toMatchObject({ ok: false, status: 400 });
    }
  });

  it("refuses to act on any admin account", () => {
    const admin = { ...contributor, role: "admin" };
    for (const action of ["preview", "delete", "role"]) {
      expect(checkAccountAction({ actorId: ADMIN_ID, target: admin, action, confirmName: "rans_test", role: "user" }))
        .toMatchObject({ ok: false, status: 403 });
    }
  });

  it("allows a preview without confirmation", () => {
    expect(ok({ action: "preview" })).toEqual({ ok: true });
  });

  it("requires the exact username to delete", () => {
    expect(ok({ action: "delete" })).toMatchObject({ ok: false, status: 400 });
    expect(ok({ action: "delete", confirmName: "RANS_TEST" })).toMatchObject({ ok: false, status: 400 });
    expect(ok({ action: "delete", confirmName: "rans" })).toMatchObject({ ok: false, status: 400 });
    expect(ok({ action: "delete", confirmName: " rans_test " })).toEqual({ ok: true });
  });

  it("requires the email when the account has no username", () => {
    const noName = { _id: contributor._id, email: "t@example.com" };
    expect(checkAccountAction({ actorId: ADMIN_ID, target: noName, action: "delete", confirmName: "t@example.com" })).toEqual({ ok: true });
  });

  it("accepts only contributor and annotator as new roles, and not the current one", () => {
    expect(ok({ action: "role", role: "annotator" })).toEqual({ ok: true });
    expect(ok({ action: "role", role: "admin" })).toMatchObject({ ok: false, status: 400 });
    expect(ok({ action: "role", role: "user" })).toMatchObject({ ok: false, status: 400 });
    expect(ok({ action: "role" })).toMatchObject({ ok: false, status: 400 });
  });

  it("waits for a session in progress before changing the role, but not before deleting", () => {
    expect(ok({ action: "role", role: "annotator", hasActiveSession: true })).toMatchObject({ ok: false, status: 409 });
    expect(ok({ action: "preview", hasActiveSession: true })).toEqual({ ok: true });
    expect(ok({ action: "delete", confirmName: "rans_test", hasActiveSession: true })).toEqual({ ok: true });
  });
});

describe("roleUpdate", () => {
  const now = new Date("2026-10-01T00:00:00Z");

  it("makes an annotator with pass 1, like set-role.mjs", () => {
    expect(roleUpdate("annotator", now)).toEqual({
      $set: { role: "annotator", annotatorPass: 1, annotatorActive: true, updatedAt: now },
    });
  });

  it("makes a contributor and clears the annotator fields", () => {
    expect(roleUpdate("user", now)).toEqual({
      $set: { role: "user", updatedAt: now },
      $unset: { annotatorPass: "", annotatorActive: "" },
    });
  });
});

describe("summarizeAccount", () => {
  it("builds a table row", () => {
    const row = summarizeAccount({ ...contributor, createdAt: "2026-09-30", age: "20-24" }, 7, ADMIN_ID);
    expect(row).toEqual({
      id: contributor._id, username: "rans_test", email: "t@example.com", role: "user", roleLabel: "Contributor",
      createdAt: "2026-09-30", profileComplete: true, annotations: 7, activeSession: false, isSelf: false, editable: true,
    });
    expect(summarizeAccount(contributor, 0, ADMIN_ID, true).activeSession).toBe(true);
  });

  it("marks your own account and admins as not editable", () => {
    expect(summarizeAccount({ ...contributor, _id: ADMIN_ID }, 0, ADMIN_ID)).toMatchObject({ isSelf: true, editable: false });
    expect(summarizeAccount({ ...contributor, role: "admin" }, 0, ADMIN_ID)).toMatchObject({ isSelf: false, editable: false, roleLabel: "Admin" });
  });

  it("reports an unfinished profile and defaults", () => {
    expect(summarizeAccount({ _id: "c".repeat(24) })).toMatchObject({
      username: null, email: null, role: "user", profileComplete: false, annotations: 0, isSelf: false, editable: true,
    });
  });
});
