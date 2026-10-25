/**
 * Email verification (S9, decided 21 Oct 2026): an account confirms its address
 * before it can annotate, and there is one account per verified address
 * (chapter_5.tex line 53, chapter_4.tex line 302).
 *
 * The rules, kept free of Node and database imports so the API routes, the
 * pages and the one-off scripts (scripts/normalize-emails.mjs,
 * scripts/verify-existing-emails.mjs) share them and tests can check them:
 *
 *   normalizeEmail           trim and lowercase, everywhere an address is
 *                            compared or stored, so the unique index on
 *                            users.email holds one account per address
 *   needsEmailVerification   the gate: a contributor whose emailVerifiedAt is
 *                            not set. Annotators and admins are never gated
 *                            (existing ones are verified by the script)
 *   checkVerifyLink          whether an emailed link confirms the address
 *   resendWaitSeconds        at most one mail per RESEND_INTERVAL_MS per account
 *
 * The token is made and hashed in src/util/verificationEmail.js, like the
 * password reset in forgot-password.js: 32 random bytes in the link, only the
 * SHA-256 stored.
 */

/** How long an emailed link works. */
export const VERIFY_LINK_TTL_MS = 24 * 60 * 60 * 1000;

/** The shortest time between two verification mails to one account. */
export const RESEND_INTERVAL_MS = 5 * 60 * 1000;

/** Sent with the 403 from annotationGet, annotationSubmit and annotationComplete. */
export const EMAIL_NOT_VERIFIED_CODE = "EMAIL_NOT_VERIFIED";

/** The activity-feed tag written when an address is confirmed. */
export const EMAIL_ACTIVITY_TAG = "email";
export const EMAIL_ACTIVITY = "Confirmed your email";

/** Why a link did not confirm the address. */
export const LINK_INVALID = "invalid";
export const LINK_EXPIRED = "expired";
export const LINK_USED = "used";

/** What /api/auth/verify-email answers, by code. No em dashes, no semicolons. */
export const VERIFY_LINK_MESSAGES = Object.freeze({
  ok: "Your email address is confirmed.",
  invalid: "This link is not valid. It may be from an older email. Send a new link and use the newest one.",
  expired: "This link has expired. Links work for 24 hours. Send a new link to try again.",
  used: "This link has already been used, and your email address is confirmed.",
  missing: "This link is incomplete. Send a new link to try again.",
});

/** What /api/auth/resend-verification answers. No em dashes, no semicolons. */
export const RESEND_MESSAGES = Object.freeze({
  sent: "A new link is on its way. Use the newest link, older ones no longer work.",
  alreadyConfirmed: "Your email address is already confirmed.",
  failed: "We could not send the email just now. Try again in a moment.",
  wait: (seconds) => {
    const minutes = Math.ceil(seconds / 60);
    return `You can ask for another link in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  },
});

/** Trimmed and lowercased. Anything that is not a string is returned unchanged, for the caller's type check. */
export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : email;
}

/**
 * True for a contributor (role "user" or no role) whose address is not
 * confirmed. False for annotators, admins, a confirmed address, and a missing
 * record (the routes handle a missing account on their own).
 */
export function needsEmailVerification(user) {
  if (!user) return false;
  const role = user.role || "user";
  if (role !== "user") return false;
  return !user.emailVerifiedAt;
}

/** The 403 the three annotation routes return while the gate is closed. */
export const EMAIL_NOT_VERIFIED_RESPONSE = Object.freeze({
  message: "Confirm your email address to start annotating. Open the link we sent you, or send a new one.",
  code: EMAIL_NOT_VERIFIED_CODE,
});

/** When a link sent at `now` stops working. */
export function verificationExpiry(now = new Date()) {
  return new Date(now.getTime() + VERIFY_LINK_TTL_MS);
}

/**
 * Whether an emailed link confirms `user`'s address. `hashedToken` is the
 * SHA-256 of the token in the link. Returns { ok: true } or { ok: false, code }:
 *
 *   used      the address is already confirmed (the link was used, or the
 *             account was confirmed another way)
 *   invalid   no such account, no link waiting, or not the newest link
 *   expired   the newest link, but older than VERIFY_LINK_TTL_MS
 *
 * The token is compared before the expiry, so a wrong link is never reported
 * as expired.
 */
export function checkVerifyLink(user, hashedToken, now = new Date()) {
  if (!user) return { ok: false, code: LINK_INVALID };
  if (user.emailVerifiedAt) return { ok: false, code: LINK_USED };
  if (typeof hashedToken !== "string" || !user.emailVerifyToken || user.emailVerifyToken !== hashedToken) {
    return { ok: false, code: LINK_INVALID };
  }
  const expire = user.emailVerifyExpire ? new Date(user.emailVerifyExpire) : null;
  if (!expire || Number.isNaN(expire.getTime()) || expire <= now) return { ok: false, code: LINK_EXPIRED };
  return { ok: true };
}

/** Seconds until `user` may be sent another mail, 0 when one may be sent now. */
export function resendWaitSeconds(user, now = new Date()) {
  const sent = user?.emailVerifySentAt ? new Date(user.emailVerifySentAt) : null;
  if (!sent || Number.isNaN(sent.getTime())) return 0;
  const waitMs = sent.getTime() + RESEND_INTERVAL_MS - now.getTime();
  return waitMs > 0 ? Math.ceil(waitMs / 1000) : 0;
}

/** The earliest emailVerifySentAt that still blocks a resend at `now`. */
export function resendCutoff(now = new Date()) {
  return new Date(now.getTime() - RESEND_INTERVAL_MS);
}
