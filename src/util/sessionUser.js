/**
 * What the login cookie holds about the signed-in person (S13, 26 Oct 2026).
 *
 * The session is a JWT kept in an encrypted cookie that the browser sends on
 * every request. It used to carry the whole users document, the activity feed
 * (up to 100 entries) and the demographics included, so an account used a lot
 * got a cookie that NextAuth split into several Set-Cookie headers, and nginx
 * answered 502 ("upstream sent too big header") at sign-in. It now carries only
 * the fields the app reads from session.user or token.user, so it stays small
 * and holds no password hash, demographics or token hashes.
 *
 * Checked with a grep over src/ on 26 Oct 2026. Each field and where it is read:
 *
 *   _id                     every API route and getServerSideProps that finds
 *                           the account (as a string), and the admin pages
 *   username                annotationGet, annotationSubmit, annotationComplete,
 *                           annotationAbandon, the annotate form, the finished
 *                           screen, the navbar, the dashboard, the _id backfill
 *   email                   choose-username and complete-profile (the upsert
 *                           key), the navbar's account menu, /check-email
 *   name, image             choose-username and complete-profile (the Google
 *                           profile saved on the account)
 *   role                    the dashboard, when the database cannot be read
 *   hasCompletedTutorial    the navbar and the dashboard
 *   isNewGoogleUser         /choose-username and the dashboard's redirect
 *   isProfileIncomplete     the navbar, /complete-profile, the finished screen
 *                           and the dashboard
 *   needsEmailVerification  the navbar, /check-email and the dashboard (S9)
 *   emailVerifiedAt         set with needsEmailVerification when a page reports
 *                           the address confirmed (the jwt update branch, S9)
 *
 * Not kept: totalAnnotations (the dashboard reads it from the database),
 * isPilot (nothing reads it from the session), age (only used to work out
 * isProfileIncomplete at sign-in), and everything else in the document.
 */
export const SESSION_USER_FIELDS = Object.freeze([
  "_id",
  "username",
  "email",
  "name",
  "image",
  "role",
  "hasCompletedTutorial",
  "isNewGoogleUser",
  "isProfileIncomplete",
  "needsEmailVerification",
  "emailVerifiedAt",
]);

/**
 * Never sent to the browser, even if one is added to SESSION_USER_FIELDS by
 * mistake: the session callback removes them.
 */
export const NEVER_IN_SESSION = Object.freeze([
  "hashedPassword",
  "activities",
  "emailVerifyToken",
  "emailVerifyExpire",
  "emailVerifySentAt",
  "resetPasswordToken",
  "resetPasswordExpire",
]);

/**
 * The cookie's copy of a person: only SESSION_USER_FIELDS, _id as a string,
 * and no field that is undefined. Anything that is not an object is returned
 * as it is.
 */
export function toSessionUser(user) {
  if (!user || typeof user !== "object") return user;
  const out = {};
  for (const field of SESSION_USER_FIELDS) {
    if (user[field] === undefined) continue;
    out[field] = field === "_id" && user._id !== null ? String(user._id) : user[field];
  }
  return out;
}

/** A copy of user without the NEVER_IN_SESSION fields. */
export function withoutPrivateFields(user) {
  const out = { ...user };
  for (const field of NEVER_IN_SESSION) delete out[field];
  return out;
}
