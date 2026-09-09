/**
 * Local cache of the in-progress annotation session.
 *
 * The annotate flow reloads the page between images, so the current batch is
 * kept in localStorage instead of being refetched each time. The server's
 * `sessions` collection stays the source of truth; when anything here is
 * missing or unreadable, callers fall back to /api/annotationGet.
 *
 * Every read is safe: corrupt or half-written values come back as null rather
 * than throwing. Note that clearing a key has to use `removeItem` — storing
 * `null` writes the string "null", which is truthy and survives a plain check.
 *
 * All functions are no-ops on the server, where localStorage doesn't exist.
 */

const TOTAL_KEY = "annotationTotalCount";
const CURRENT_KEY = "annotationCurrentCount";
const DATA_KEY = "annotationSetData";

const hasStorage = () => typeof window !== "undefined" && !!window.localStorage;

/** Reads a JSON value, returning null rather than throwing on corrupt data. */
export function readSessionData() {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(DATA_KEY);
    if (!raw || raw === "null" || raw === "undefined") return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Reads a counter, returning null for missing, "null", or non-numeric values. */
export function readCount(key) {
  if (!hasStorage()) return null;
  const parsed = parseInt(window.localStorage.getItem(key), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export const readTotalCount = () => readCount(TOTAL_KEY);
export const readCurrentCount = () => readCount(CURRENT_KEY);

/**
 * Writes any subset of the cached session. Fields left out are untouched, so
 * callers can update just the counter or just the batch.
 *
 * @param {{ total?: number, current?: number, data?: unknown }} fields
 */
export function writeSession({ total = undefined, current = undefined, data = undefined } = {}) {
  if (!hasStorage()) return;
  if (total !== undefined) window.localStorage.setItem(TOTAL_KEY, String(total));
  if (current !== undefined) window.localStorage.setItem(CURRENT_KEY, String(current));
  if (data !== undefined) window.localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

export function writeCurrentCount(current) {
  if (!hasStorage()) return;
  window.localStorage.setItem(CURRENT_KEY, String(current));
}

/** Drops the cached session entirely. Use on logout, abandon, and completion. */
export function clearSession() {
  if (!hasStorage()) return;
  window.localStorage.removeItem(TOTAL_KEY);
  window.localStorage.removeItem(CURRENT_KEY);
  window.localStorage.removeItem(DATA_KEY);
}

/** True when a usable batch is cached locally. */
export function hasCachedSession() {
  return readTotalCount() !== null && readCurrentCount() !== null && !!readSessionData();
}

export const SESSION_KEYS = { TOTAL_KEY, CURRENT_KEY, DATA_KEY };
