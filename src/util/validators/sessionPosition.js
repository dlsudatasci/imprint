/**
 * Where a session may stand (S20, 7 Nov 2026). The position is 1-based, as
 * the client's currentAnnotationCount, annotationGet's currentCount and
 * reachedCountOf all are: 1 is the session's first photo, `total` its last,
 * and `total + 1` the finished screen, which the last photo's Next Image
 * stores and a resume reads to show it.
 *
 * Only annotationSubmit adds to completedImageIDs, and only for a photo of
 * the session the person has reached. A photo is reached only by sending
 * every photo before it, so `completedCount + 1` is the next unfinished
 * photo. No position past it is stored or served: before this, a hand-made
 * request could open the strip to photos never seen.
 *
 * The spec's first draft capped at `total`. That would turn a finished
 * session (position `total + 1`) back to its last photo on a resume, so the
 * cap is `total + 1`, reachable only once every photo is sent.
 */

/** The session's photo count: its images as served, or the size chosen for a session without them */
export function sessionTotal(session) {
  if (Array.isArray(session?.imageIDs) && session.imageIDs.length > 0) return session.imageIDs.length;
  const total = Number(session?.totalCount);
  return Number.isInteger(total) && total > 0 ? total : 0;
}

/** How many of the session's photos were sent (each counted once) */
export function completedCount(session) {
  return Array.isArray(session?.completedImageIDs) ? new Set(session.completedImageIDs.map(String)).size : 0;
}

/**
 * The position to store or serve for `requested`: never past the next
 * unfinished photo, nor past the finished screen. A request over it is
 * clamped, not refused, so a page with an old cache keeps working. 0 and
 * anything at or under the cap pass through unchanged.
 */
export function capPosition(requested, { total, completedCount: done }) {
  const next = (Number.isInteger(done) && done >= 0 ? done : 0) + 1;
  // A session whose size is unknown is capped by what was sent alone
  const finished = Number.isInteger(total) && total > 0 ? total + 1 : Infinity;
  return Math.min(requested, next, finished);
}

/** True when `imageID` was already sent in this session (ids compared as text: stored ones may be numbers) */
export function wasSent(session, imageID) {
  return Array.isArray(session?.completedImageIDs) && session.completedImageIDs.some((id) => String(id) === String(imageID));
}
