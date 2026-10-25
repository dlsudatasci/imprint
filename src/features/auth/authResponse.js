import { AUTH_COPY } from "./authCopy";

/**
 * Reading the answers of the auth routes in the browser (S8, 26 Oct 2026).
 *
 * Sign-in, sign-up and the password reset routes sit behind a request limit in
 * nginx (deploy/nginx.conf), which answers 429 itself, before the app. So a
 * form checks the status first and never relies on the body being the app's
 * JSON: readJson gives {} for anything that is not JSON.
 */
export const RATE_LIMITED = 429;

/** True when the request limit refused the request. */
export function isRateLimited(res) {
  return res?.status === RATE_LIMITED;
}

/** The body as JSON, or {} when it is empty or not JSON. */
export async function readJson(res) {
  try {
    const data = await res.json();
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/**
 * The message for a 429. The app's own 429s carry a message of their own (the
 * five-minute wait on resend-verification), which is kept. The limit's says to
 * wait a minute.
 */
export function rateLimitMessage(data) {
  return typeof data?.message === "string" && data.message ? data.message : AUTH_COPY.tooManyAttempts;
}

/** The error NextAuth reports when the limit refused a sign-in (the url nginx sends). */
export const TOO_MANY_ATTEMPTS_ERROR = "TooManyAttempts";

/** True when signIn("credentials", { redirect: false }) was refused by the limit. */
export function signInRateLimited(result) {
  return result?.status === RATE_LIMITED || result?.error === TOO_MANY_ATTEMPTS_ERROR;
}
