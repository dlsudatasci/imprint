import crypto from "crypto";

/**
 * The two locks on POST /api/internal/campaigns (S29, 16 Nov 2026). Both
 * must hold, and anything else is answered 404, as if the route did not
 * exist.
 *
 * 1. The request comes from inside the container (fromInsideContainer
 *    below). Requests through the public site arrive from Coolify's proxy,
 *    never from loopback. The header check also covers a proxy on the same
 *    machine (deploy/nginx.conf on a VM forwards from 127.0.0.1 and adds
 *    X-Forwarded-For with the visitor's address, and X-Real-IP).
 * 2. `Authorization: Bearer <CAMPAIGN_SECRET>`, compared in constant time.
 *    With no CAMPAIGN_SECRET set, every request is refused.
 */

export const LOOPBACK = Object.freeze(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
// Set only by a proxy. Next.js itself never adds these.
const PROXY_ONLY_HEADERS = ["x-real-ip", "forwarded"];

/**
 * Next.js adds x-forwarded-host, -port, -proto and -for to every request
 * before a handler runs (next/dist/server/base-server.js, `??=` with the
 * socket's address), so their presence says nothing. What does: the socket
 * is loopback, x-forwarded-for (when present) lists only loopback addresses,
 * and there is no x-real-ip or forwarded header. A proxy on the same machine
 * puts the visitor's own address in x-forwarded-for, which fails here.
 */
export function fromInsideContainer(req) {
  const address = req?.socket?.remoteAddress;
  if (!LOOPBACK.includes(address)) return false;
  const headers = req.headers || {};
  if (PROXY_ONLY_HEADERS.some((h) => headers[h] !== undefined)) return false;
  const forwarded = headers["x-forwarded-for"];
  if (forwarded === undefined) return true;
  const hops = (Array.isArray(forwarded) ? forwarded.join(",") : String(forwarded)).split(",").map((s) => s.trim());
  return hops.length > 0 && hops.every((hop) => LOOPBACK.includes(hop));
}

export function hasCampaignSecret(req, secret) {
  if (!secret) return false;
  const header = req?.headers?.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  // Hash both sides, so the compare is constant-time whatever the lengths
  const given = crypto.createHash("sha256").update(header.slice("Bearer ".length)).digest();
  const expected = crypto.createHash("sha256").update(String(secret)).digest();
  return crypto.timingSafeEqual(given, expected);
}

export function campaignRouteAllowed(req, secret) {
  return fromInsideContainer(req) && hasCampaignSecret(req, secret);
}
