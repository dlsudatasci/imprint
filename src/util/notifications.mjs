/**
 * Messages in the notification tray (S29, 16 Nov 2026). A campaign email is
 * also written to the user's `activities` feed as `{ tag: "message", title,
 * activity, date, campaign }`. A message is unread while it is newer than
 * `users.notificationsSeenAt`, which opening the bell sets to now
 * (/api/notifications/seen). Plain module, read by the server (extractUser)
 * and the navbar.
 *
 * S33 (17 Nov 2026): a message may carry `href`, the page it opens, a path on
 * this site. `sitePath` is the one check of it.
 */

export const MESSAGE_TAG = "message";

/**
 * `value` when it is a path on this site ("/contribute"), otherwise null:
 * not another site, and not "//host" or "/\\host", which a browser reads as one.
 */
export function sitePath(value) {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : null;
}

const timeOf = (value) => {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
};

/** True when `a` is a message entry newer than `seenAt` (never seen counts as unread). */
export function isUnreadMessage(a, seenAt) {
  if (!a || a.tag !== MESSAGE_TAG) return false;
  const time = timeOf(a.date);
  if (time === null) return false;
  const seen = seenAt ? timeOf(seenAt) : null;
  return seen === null || time > seen;
}

/** Whether any message in the feed is unread. */
export function hasUnreadMessage(activities, seenAt) {
  return Array.isArray(activities) && activities.some((a) => isUnreadMessage(a, seenAt));
}
