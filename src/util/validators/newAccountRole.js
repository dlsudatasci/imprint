/**
 * The role a new account starts with, for both password sign-up
 * (/api/auth/register) and Google sign-up (/api/auth/choose-username).
 *
 * One server setting decides it: SIGNUP_ROLE in the server's .env.
 * SIGNUP_ROLE=annotator makes every new account an annotator. Anything else
 * (missing, empty, "user", a typo, even "admin") makes contributors, which is
 * the default.
 *
 * It works on the live site on purpose (decided 6 Oct 2026): while the site is
 * not public, annotators sign up and go straight to the annotator tutorial
 * without an admin changing their role first. It must be turned off before
 * contributors open, or they would become annotators too. The admin Accounts
 * tab shows a notice while it is on.
 *
 * Turning it on or off is an edit to the server's .env and a restart, with no
 * deploy. It only decides the role an account is created with. Existing
 * accounts are never changed, and admin can never be given this way.
 *
 * Replaces the earlier local-only switch (6 Oct 2026), so there is one switch.
 */
export const SIGNUP_ROLE_SETTING = "SIGNUP_ROLE";
export const DEFAULT_ROLE = "user";
export const ANNOTATOR_ROLE = "annotator";

/** "annotator" when SIGNUP_ROLE is exactly "annotator", otherwise "user". */
export function signupRole(env = process.env) {
  return env[SIGNUP_ROLE_SETTING] === ANNOTATOR_ROLE ? ANNOTATOR_ROLE : DEFAULT_ROLE;
}

/**
 * The role fields a new account starts with. Annotators get the same fields the
 * admin Accounts tab sets (roleUpdate in accountAdmin.js): single-pass
 * annotation (annotatorPass 1) and annotatorActive true.
 */
export function newAccountFields(env = process.env) {
  if (signupRole(env) === ANNOTATOR_ROLE) {
    return { role: ANNOTATOR_ROLE, annotatorPass: 1, annotatorActive: true };
  }
  return { role: DEFAULT_ROLE };
}
