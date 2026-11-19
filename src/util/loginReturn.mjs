/**
 * Coming back to a page after signing in (S33, 17 Nov 2026). The exit
 * questionnaire email's button goes to /contribute/exit-survey: signed out,
 * that leads to /login, which then returns there instead of the dashboard.
 * The leaderboard (18 Nov 2026) the same, for the announcement's main button.
 *
 * Only the pages listed here. Anything else in `next` is ignored, so the
 * address can never send someone to another site or an unexpected page.
 */
export const RETURN_PATHS = Object.freeze(["/contribute/exit-survey", "/contribute/leaderboard"]);

/** Where a signed-out visitor to `pathname` is sent to sign in. */
export function loginPathFor(pathname) {
  return RETURN_PATHS.includes(pathname) ? `/login?next=${encodeURIComponent(pathname)}` : "/login";
}

/** Where sign-in leads: the listed page asked for in `next`, or the dashboard. */
export function afterLoginPath(next) {
  return typeof next === "string" && RETURN_PATHS.includes(next) ? next : "/contribute";
}
