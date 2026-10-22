/**
 * What scripts/remove-admin-sessions.mjs removes and puts back (22 Oct 2026):
 * an admin's own annotation sessions, done to see the contributor screens.
 * The annotate flow treats an admin as a contributor, so those answers were
 * stored as contributor data and counted everywhere real answers are.
 *
 * Kept apart from the script so the arithmetic is tested.
 */

/** Telemetry a session writes. An admin's own actions (ROLE_CHANGED, ACCOUNT_DELETED, MODEL_PREDICTIONS_UPDATED) are kept. */
export const SESSION_EVENTS = Object.freeze([
  "SESSION_START",
  "IMAGE_SUBMITTED",
  "SESSION_END",
  "SESSION_COMPLETE",
  "POOL_EXHAUSTION",
  "NASA_TLX_SUBMITTED",
  "NASA_TLX_DISMISSED",
  "EXIT_SURVEY_SUBMITTED",
]);

/** Activity lines a session adds to the account (annotationComplete, annotationAbandon) */
export const SESSION_ACTIVITY_TAGS = Object.freeze(["Annotation Session Done", "Session Abandoned"]);

/** Records that belong to this account, however the userId was written (as accounts.js finds them) */
export function ownedFilter(user, ObjectId) {
  const id = String(user._id);
  const or = [{ userId: { $in: [id, new ObjectId(id)] } }];
  if (user.username) or.push({ username: user.username });
  return { $or: or };
}

/**
 * How much each photo's annotationCount went up for these sessions, to take
 * back off. A finished session counted every photo it was given, by Image
 * _id (annotationComplete); a stopped one counted the photos finished, by
 * imageID (annotationAbandon); an active one has counted nothing yet.
 * Returns { byId: [[_id, n]], byImageID: [[imageID, n]] }.
 */
export function annotationCountReversal(sessions = []) {
  const byId = new Map();
  const byImageID = new Map();
  const add = (map, key, raw) => {
    const prev = map.get(key);
    map.set(key, { value: raw, n: (prev?.n ?? 0) + 1 });
  };
  for (const s of sessions) {
    if (!s) continue;
    if (s.status === "completed") {
      for (const id of s.imageIDs || []) add(byId, String(id), id);
    } else if (s.status === "abandoned") {
      for (const imageID of s.completedImageIDs || []) add(byImageID, String(imageID), imageID);
    }
  }
  return {
    byId: [...byId.values()].map(({ value, n }) => [value, n]),
    byImageID: [...byImageID.values()].map(({ value, n }) => [value, n]),
  };
}

/** The write that takes n off a photo's annotationCount, never below 0 */
export function decrementCount(filter, n) {
  return {
    updateOne: {
      filter,
      update: [{ $set: { annotationCount: { $max: [0, { $subtract: [{ $ifNull: ["$annotationCount", 0] }, n] }] } } }],
    },
  };
}
