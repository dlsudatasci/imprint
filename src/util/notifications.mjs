/**
 * Messages in the notification tray (S29, 16 Nov 2026). A campaign email is
 * also written to the user's `activities` feed as `{ tag: "message", title,
 * activity, date, campaign }`. A message is unread while it is newer than
 * `users.notificationsSeenAt`, which opening the bell sets to now
 * (/api/notifications/seen). Plain module, read by the server (extractUser)
 * and the navbar.
 */

export const MESSAGE_TAG = "message";

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
