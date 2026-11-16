import crypto from "crypto";

/**
 * Signed links in participant emails (S29, 16 Nov 2026): the stop link works
 * without signing in, so it carries the account id and an HMAC of it. Plain
 * Node with no `@/` imports, so the campaign sender and any script can use it.
 *
 * The key is derived from NEXTAUTH_SECRET with a label of its own, so a token
 * made here can never stand in for anything NextAuth signs, and changing the
 * secret retires every old link. The email address is never in the link.
 */

const KEY_LABEL = "imprint-email-links";
const OBJECT_ID = /^[0-9a-f]{24}$/i;

function linkKey(secret) {
  if (!secret) throw new Error("NEXTAUTH_SECRET is needed to sign email links");
  return crypto.createHmac("sha256", String(secret)).update(KEY_LABEL).digest();
}

/** HMAC-SHA256 of "unsubscribe:<userId>", hex. */
export function unsubscribeToken(userId, secret) {
  return crypto.createHmac("sha256", linkKey(secret)).update(`unsubscribe:${String(userId)}`).digest("hex");
}

/** The page a person opens from the email: `${origin}/unsubscribe?u=<id>&t=<token>`. */
export function unsubscribeUrl(userId, origin, secret) {
  const base = String(origin).replace(/\/+$/, "");
  const u = encodeURIComponent(String(userId));
  return `${base}/unsubscribe?u=${u}&t=${unsubscribeToken(userId, secret)}`;
}

/** The one-click address for the List-Unsubscribe header (RFC 8058), the same pair. */
export function oneClickUnsubscribeUrl(userId, origin, secret) {
  const base = String(origin).replace(/\/+$/, "");
  const u = encodeURIComponent(String(userId));
  return `${base}/api/email/unsubscribe?u=${u}&t=${unsubscribeToken(userId, secret)}`;
}

/**
 * Whether `t` is the token for account `u`. Constant-time, and false for
 * anything that is not an account id and a 64-character hex token, so a
 * token of another length never reaches `timingSafeEqual` (which throws on
 * unequal lengths).
 */
export function checkUnsubscribe(u, t, secret) {
  if (typeof u !== "string" || !OBJECT_ID.test(u)) return false;
  if (typeof t !== "string" || !/^[0-9a-f]{64}$/i.test(t)) return false;
  if (!secret) return false;
  const expected = Buffer.from(unsubscribeToken(u, secret), "hex");
  const given = Buffer.from(t, "hex");
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(given, expected);
}
