/**
 * The fields a new account starts with, for password sign-up
 * (/api/auth/register), Google sign-up (/api/auth/choose-username) and a
 * Google account that completes its profile before choosing a username
 * (/api/auth/complete-profile). All three spread newAccountFields(), so these
 * two switches cover every way an account is created.
 *
 * Two server settings in the server's .env decide them. Turning either on or
 * off is an edit to the .env and a restart, with no deploy. They only decide
 * the fields an account is created with. Existing accounts are never changed,
 * and admin can never be given this way. The admin Accounts tab shows a notice
 * while either is on.
 *
 * SIGNUP_ROLE: SIGNUP_ROLE=annotator makes every new account an annotator.
 * Anything else (missing, empty, "user", a typo, even "admin") makes
 * contributors, which is the default. It works on the live site on purpose
 * (decided 6 Oct 2026): while the site is not public, annotators sign up and go
 * straight to the annotator tutorial without an admin changing their role
 * first. It must be turned off before contributors open, or they would become
 * annotators too. Replaces the earlier local-only switch (6 Oct 2026), so there
 * is one role switch.
 *
 * SIGNUP_PILOT (S11, decided 23 Oct 2026): SIGNUP_PILOT=true marks every new
 * contributor as a pilot account (isPilot: true), so the pilot's accounts can
 * be told apart from the annotators' and test accounts on staging. Anything
 * else (missing, empty, "TRUE", "1", a typo) is off, and then no isPilot field
 * is written at all. It never marks an annotator, so with SIGNUP_ROLE=annotator
 * also on, new accounts are annotators without isPilot. Set on staging only,
 * after the freeze dump, and removed when the pilot ends. Production never gets
 * it.
 */
export const SIGNUP_ROLE_SETTING = "SIGNUP_ROLE";
export const SIGNUP_PILOT_SETTING = "SIGNUP_PILOT";
export const DEFAULT_ROLE = "user";
export const ANNOTATOR_ROLE = "annotator";

/** "annotator" when SIGNUP_ROLE is exactly "annotator", otherwise "user". */
export function signupRole(env = process.env) {
  return env[SIGNUP_ROLE_SETTING] === ANNOTATOR_ROLE ? ANNOTATOR_ROLE : DEFAULT_ROLE;
}

/** True when SIGNUP_PILOT is exactly "true", otherwise false. */
export function signupPilot(env = process.env) {
  return env[SIGNUP_PILOT_SETTING] === "true";
}

/**
 * The fields a new account starts with. Annotators get the same fields the
 * admin Accounts tab sets (roleUpdate in accountAdmin.js): single-pass
 * annotation (annotatorPass 1) and annotatorActive true, and are never pilot
 * accounts. Contributors get role "user", plus isPilot true while SIGNUP_PILOT
 * is on.
 */
export function newAccountFields(env = process.env) {
  if (signupRole(env) === ANNOTATOR_ROLE) {
    return { role: ANNOTATOR_ROLE, annotatorPass: 1, annotatorActive: true };
  }
  if (signupPilot(env)) {
    return { role: DEFAULT_ROLE, isPilot: true };
  }
  return { role: DEFAULT_ROLE };
}
