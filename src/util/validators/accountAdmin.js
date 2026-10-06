/**
 * Rules for the admin Accounts tab (/api/admin/accounts), decided 1 Oct 2026.
 *
 * An admin can list every account, switch a person between contributor and
 * annotator, and delete an account with everything it recorded (the consent form,
 * Appendix C, lets participants ask for their data to be deleted). Admin accounts,
 * including your own, cannot be changed or deleted here.
 */

/** Roles an admin can switch between from the dashboard. "user" is a contributor. */
export const EDITABLE_ROLES = Object.freeze(["user", "annotator"]);

export const ROLE_LABELS = Object.freeze({ user: "Contributor", annotator: "Annotator", admin: "Admin" });

/** Collections whose documents carry the person's userId and are deleted with the account. */
export const USER_DATA_COLLECTIONS = Object.freeze(["annotations", "sessions", "telemetry_logs", "nasa_tlx", "exit_surveys"]);

/** The name an admin types to confirm a deletion: the username, or the email if none was chosen yet. */
export function accountLabel(user) {
  return (user && (user.username || user.email)) || "";
}

export function roleOf(user) {
  return user?.role || "user";
}

/**
 * Checks whether `actorId` may perform `action` ("preview", "delete" or "role")
 * on `target`. Returns { ok: true } or { ok: false, status, message }.
 *
 * A role change waits until the person has no session in progress: a session keeps
 * the images drawn for the old role, while annotationSubmit tags each answer with
 * the current role, so switching mid-session would mix the two pools.
 */
export function checkAccountAction({ actorId, target, action, confirmName, role, hasActiveSession = false } = {}) {
  if (!["preview", "delete", "role"].includes(action)) {
    return { ok: false, status: 400, message: "Unknown action." };
  }
  if (!target) return { ok: false, status: 404, message: "Account not found." };
  if (String(target._id) === String(actorId)) {
    return { ok: false, status: 400, message: "You cannot change or delete your own account." };
  }
  if (roleOf(target) === "admin") {
    return { ok: false, status: 403, message: "Admin accounts cannot be changed or deleted here." };
  }
  if (action === "delete") {
    const expected = accountLabel(target);
    if (typeof confirmName !== "string" || confirmName.trim() !== expected) {
      return { ok: false, status: 400, message: `Type ${expected} exactly to confirm.` };
    }
  }
  if (action === "role") {
    if (!EDITABLE_ROLES.includes(role)) {
      return { ok: false, status: 400, message: "Role must be contributor or annotator." };
    }
    if (roleOf(target) === role) {
      return { ok: false, status: 400, message: `This account is already a ${ROLE_LABELS[role].toLowerCase()}.` };
    }
    if (hasActiveSession) {
      return {
        ok: false,
        status: 409,
        message: "This person has a session in progress. The role can change once they finish or stop it.",
      };
    }
  }
  return { ok: true };
}

/**
 * The users-collection update for a role change. Same fields as scripts/set-role.mjs:
 * annotators get annotatorPass 1 (single-pass annotation) and annotatorActive true,
 * contributors lose both.
 */
export function roleUpdate(role, now = new Date()) {
  if (role === "annotator") {
    return { $set: { role, annotatorPass: 1, annotatorActive: true, updatedAt: now } };
  }
  return { $set: { role, updatedAt: now }, $unset: { annotatorPass: "", annotatorActive: "" } };
}

/** One row of the Accounts table. */
export function summarizeAccount(user, annotationCount = 0, actorId = null, hasActiveSession = false) {
  const role = roleOf(user);
  return {
    id: String(user._id),
    username: user.username || null,
    email: user.email || null,
    role,
    roleLabel: ROLE_LABELS[role] || role,
    createdAt: user.createdAt || null,
    profileComplete: Boolean(user.age),
    annotations: annotationCount,
    activeSession: Boolean(hasActiveSession),
    isSelf: actorId != null && String(user._id) === String(actorId),
    editable: role !== "admin" && !(actorId != null && String(user._id) === String(actorId)),
  };
}
