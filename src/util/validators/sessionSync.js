/**
 * Keeping the browser's saved copy of a session (util/sessionCache) in step
 * with the account's session on the server (23 Oct 2026).
 *
 * The annotate page keeps the batch in localStorage so it does not reload it
 * for every image, and it used to trust that copy completely. An annotator who
 * left a phone overnight came back to a copy of a session that was no longer
 * the account's current one, and Next said "That image is not part of your
 * current session." The copy goes out of step when the session is stopped,
 * finished or replaced in another tab or on another device, or when the
 * tutorial's practice photos are written over it.
 */

/** Why annotationSubmit refused an image because of the session, sent as `code` with the 409 and 403 */
export const SESSION_CHANGED_CODES = Object.freeze({
  noSession: "NO_ACTIVE_SESSION",
  otherSession: "IMAGE_NOT_IN_SESSION",
});

/** True when a refused submit's body says the session it belonged to is not the current one */
export function isSessionChanged(body) {
  return Object.values(SESSION_CHANGED_CODES).includes(body?.code);
}

/** A batch's images, by Image _id as text, in order */
export function batchIds(data) {
  const records = Array.isArray(data?.imgRecords) ? data.imgRecords : [];
  return records.map((img) => (img && img._id != null ? String(img._id) : null));
}

/** The same images in the same order, none of them missing an _id */
export function sameBatch(a, b) {
  const x = batchIds(a);
  const y = batchIds(b);
  return x.length > 0 && x.length === y.length && x.every((id, i) => id !== null && id === y[i]);
}

/**
 * What to do with the saved copy once the server has said what is active
 * (/api/annotationGet with an empty body):
 *   "keep"     it is the account's current session, or the server could not
 *              be asked (offline): the saved copy is all there is
 *   "replace"  another session is active: put that one in its place
 *   "clear"    nothing is active any more: the saved copy is of an ended session
 */
export function cachedSessionCheck(cached, server) {
  if (!server || typeof server !== "object" || server.error) return "keep";
  const active = server.isExistingSession === true && Array.isArray(server.imgRecords) && server.imgRecords.length > 0;
  if (!active) return "clear";
  return sameBatch(cached, server) ? "keep" : "replace";
}
