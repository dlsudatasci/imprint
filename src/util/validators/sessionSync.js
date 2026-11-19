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
import { DEFAULT_MODEL_VERSION } from "./annotationGet";

/**
 * Why annotationSubmit refused an image because of the session, sent as
 * `code` with the 409 and 403. MODEL_UPDATED (S34, 19 Nov 2026): the photo's
 * suggestions were updated after the page loaded them, so the answer was
 * given on suggestions the server no longer has.
 */
export const SESSION_CHANGED_CODES = Object.freeze({
  noSession: "NO_ACTIVE_SESSION",
  otherSession: "IMAGE_NOT_IN_SESSION",
  modelUpdated: "MODEL_UPDATED",
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

/** A batch's model versions by Image _id as text, an image with none as DEFAULT_MODEL_VERSION (as annotationGet serves it) */
export function batchModelVersions(data) {
  const records = Array.isArray(data?.imgRecords) ? data.imgRecords : [];
  const versions = new Map();
  for (const img of records) {
    if (img && img._id != null) versions.set(String(img._id), img.modelVersion || DEFAULT_MODEL_VERSION);
  }
  return versions;
}

/** True when any image's suggestions come from a different model in the two copies of a batch (S34) */
export function modelVersionsDiffer(a, b) {
  const x = batchModelVersions(a);
  const y = batchModelVersions(b);
  for (const [id, version] of x) {
    if (y.has(id) && y.get(id) !== version) return true;
  }
  return false;
}

/**
 * What to do with the saved copy once the server has said what is active
 * (/api/annotationGet with an empty body):
 *   "keep"     it is the account's current session, or the server could not
 *              be asked (offline): the saved copy is all there is
 *   "replace"  another session is active: put that one in its place. Also
 *              the same session when any photo's suggestions were updated
 *              since the copy was saved (S34, 19 Nov 2026), so a returning
 *              person answers on the updated suggestions
 *   "clear"    nothing is active any more: the saved copy is of an ended session
 */
export function cachedSessionCheck(cached, server) {
  if (!server || typeof server !== "object" || server.error) return "keep";
  const active = server.isExistingSession === true && Array.isArray(server.imgRecords) && server.imgRecords.length > 0;
  if (!active) return "clear";
  if (!sameBatch(cached, server)) return "replace";
  return modelVersionsDiffer(cached, server) ? "replace" : "keep";
}
