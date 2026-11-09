/**
 * The admin page's average session duration (S22, 9 Nov 2026).
 *
 * Until S22 the page averaged `sessionDurationMs` over SESSION_COMPLETE
 * telemetry, which nothing writes: a finished session is logged as
 * SESSION_END with no duration. So the figure was always empty. It is now
 * read from the sessions collection: a completed session's length is from
 * `createdAt` (annotationGet, when the batch is drawn) to `completedAt`
 * (annotationComplete, when it is marked completed). A session missing
 * either time is left out.
 *
 * Contributors only. A session's record has no role, so annotators are
 * left out by their user ids, read from `users` (role "annotator"), in both
 * the string and the ObjectId form, as nasa-tlx-summary.js does.
 */

/** Both forms of each annotator's id, for a `$nin` on a session's `userId` */
export function annotatorIdForms(annotators = []) {
  return annotators.flatMap(({ _id }) => [_id.toString(), _id]);
}

/** The completed sessions worth reading: contributors', with an end time */
export function completedSessionQuery(annotatorIds = []) {
  return {
    status: "completed",
    completedAt: { $exists: true },
    ...(annotatorIds.length > 0 ? { userId: { $nin: annotatorIds } } : {}),
  };
}

/** A session's start or end as epoch ms, or null when it is missing or not a date */
function timeOf(value) {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The mean length, in ms, of the completed contributor sessions among
 * `sessions`, or null when there are none. The same rules as the query, so
 * the result does not depend on the database having applied it: a session
 * not completed, an annotator's, or one without both times or ending before
 * it started is left out.
 */
export function averageSessionDurationMs(sessions = [], annotatorIds = []) {
  const annotators = new Set(annotatorIds.map(String));
  const lengths = [];
  for (const session of sessions) {
    if (session?.status !== "completed") continue;
    if (annotators.has(String(session.userId))) continue;
    const start = timeOf(session.createdAt);
    const end = timeOf(session.completedAt);
    if (start === null || end === null || end < start) continue;
    lengths.push(end - start);
  }
  if (lengths.length === 0) return null;
  return lengths.reduce((sum, ms) => sum + ms, 0) / lengths.length;
}
