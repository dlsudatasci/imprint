/**
 * Every string the navbar shows, and the rule for its annotate shortcut, so
 * tests can check them (16 Oct 2026): no em dashes and no semicolons in
 * user-facing copy.
 */
export const NAV_COPY = Object.freeze({
  navLabel: "Main",
  homeLabel: "Imprint home",
  volunteer: "Volunteer",
  notifications: "Notifications",
  noNotifications: "No new notifications.",
  earlier: "Earlier",
  profileTitle: "Complete your profile",
  profileText: "Annotating opens once your profile is done.",
  account: "Account menu",
  signedIn: "Signed in",
  dashboard: "Dashboard",
  logout: "Log out",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  resumeTutorial: "Resume Tutorial",
  resumeSession: "Resume Session",
  annotate: "Let's Annotate!",
});

/** The pages every visitor can reach from the bar, in order. */
export const PUBLIC_LINKS = Object.freeze([
  Object.freeze({ href: "/", label: "Home" }),
  Object.freeze({ href: "/about", label: "About" }),
]);

/** Pages that already are the way into annotating, so the shortcut would only repeat them. */
const SHORTCUT_HIDDEN_ON = new Set(["/contribute", "/contribute/annotate", "/contribute/tutorial"]);

/**
 * The signed-in shortcut into annotating, or null when there is none.
 *
 * Shown only once the profile and the tutorial are both complete, the same
 * condition as the dashboard's own button, so the bar cannot skip onboarding.
 * Its label follows the session in browser storage: Resume Tutorial, Resume
 * Session, or Let's Annotate! (the dashboard's wording).
 *
 * Until 16 Oct 2026 the phone menu used a different rule from the laptop bar
 * and showed the shortcut on the dashboard and the annotation page as well.
 * One rule now serves both.
 */
export function annotateShortcut({ pathname, profileIncomplete, hasCompletedDemo, isTutorialSession, hasActiveSession }) {
  if (SHORTCUT_HIDDEN_ON.has(pathname) || profileIncomplete || !hasCompletedDemo) return null;
  if (isTutorialSession) return { href: "/contribute/tutorial", label: NAV_COPY.resumeTutorial };
  return { href: "/contribute/annotate", label: hasActiveSession ? NAV_COPY.resumeSession : NAV_COPY.annotate };
}

/** How many past entries the tray lists, so it never builds up (Rans, 16 Oct 2026). */
export const NOTIFICATION_HISTORY_LIMIT = 3;

/**
 * Tags the server writes to a user's `activities` feed, and how the tray shows
 * each. Registration and profile completion keep the old tray's wording ("Welcome
 * to Imprint!", "Profile completed"). A session's own line is shown as stored.
 */
const ACTIVITY_VIEWS = {
  register: () => ({ title: "Welcome to Imprint!", text: "Thanks for joining our community." }),
  profile: () => ({ title: "Profile completed", text: "You're all set to start mapping." }),
  "Annotation Session Done": (a) => ({ title: "Session finished", text: a.activity }),
  "Session Abandoned": (a) => {
    // Stored as "Abandoned session (2 annotations finished)"
    const inside = /\(([^)]+)\)/.exec(a.activity)?.[1];
    return { title: "Session stopped", text: inside ? inside[0].toUpperCase() + inside.slice(1) : a.activity };
  },
};

/**
 * The tray's history (16 Oct 2026): the most recent entries of the user's
 * activity feed (users.activities, written by register, choose-username,
 * complete-profile, annotationComplete and annotationAbandon, read through
 * /api/extractUser), newest first, at most `limit`. The old tray's history
 * was static text that every user saw. Entries without a usable date or text
 * are skipped.
 */
export function notificationHistory(activities, limit = NOTIFICATION_HISTORY_LIMIT) {
  if (!Array.isArray(activities)) return [];
  return activities
    .filter((a) => a && typeof a.activity === "string" && a.activity.trim() && !Number.isNaN(new Date(a.date).getTime()))
    .map((a) => ({ a, time: new Date(a.date).getTime() }))
    .sort((x, y) => y.time - x.time)
    .slice(0, limit)
    .map(({ a, time }) => {
      const view = ACTIVITY_VIEWS[a.tag]?.(a) ?? { title: a.activity, text: "" };
      return { ...view, time };
    });
}

/** "Oct 16", the Philippine way, in Philippine time, for a history entry. */
export function historyDate(time) {
  return new Date(time).toLocaleDateString("en-PH", { day: "numeric", month: "short", timeZone: "Asia/Manila" });
}
