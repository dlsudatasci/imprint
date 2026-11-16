import { ObjectId } from "mongodb";

/**
 * The contributors' leaderboard (S32, 17 Nov 2026): who has annotated the most
 * photos properly. Plain Node, the database handed in, so the count can be
 * tested on a fake one and run from a script.
 *
 * A photo counts when it is a contributor's completed annotation and was not
 * last saved in a rushed session. "Rushed" is the thesis's Screen 2 session
 * rule (pipeline_methodology.md §7af, fixed 21 Oct 2026), computed for the
 * retraining data by the training repository's
 * `src/imprint_training/quality/screens.py`, `screen2`. The two must agree:
 * `leaderboard.fixture.json` is run through both.
 *
 * Nothing here leaves the server but a name and a count. `userKey` (the
 * account's `_id` as text) is internal.
 */

// Screen 2's session thresholds: §7af and screens.py (S2_MEDIAN_IMAGE_MS,
// S2_MEAN_ANSWER_MS). Change them there first, then here, never here alone.
export const RUSHED_MEDIAN_IMAGE_MS = 5000;
export const RUSHED_MEAN_ANSWER_MS = 1000;

/** Rows on the board */
export const TOP_COUNT = 20;
/** How long the ranks and counts are kept in the server's memory */
export const CACHE_MS = 5 * 60 * 1000;
/** LEADERBOARD_VIEWED is logged at most once per person in this long */
export const VIEW_LOG_GAP_MS = 10 * 60 * 1000;

export const HIDDEN_NAME_PREFIX = "Imprint Contributor #";

/** A date, a date string or a number as milliseconds, or null */
function ms(value) {
  if (value == null || value === "") return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** A contributor: `role` "user" or missing, and not a pilot (as campaigns.mjs selects them) */
export function isContributor(user) {
  return !!user && (user.role === "user" || user.role == null) && user.isPilot !== true;
}

/**
 * Each person's sessions by start time, to place an event or an annotation in
 * its session: the latest one started at or before it (screens.py,
 * `SessionIndex`). A session with no `createdAt` is never a placement.
 */
export function sessionIndex(sessions) {
  const byPerson = new Map();
  for (const s of sessions) {
    const at = ms(s.createdAt);
    if (at === null) continue;
    const person = String(s.userId);
    if (!byPerson.has(person)) byPerson.set(person, []);
    byPerson.get(person).push({ at, key: String(s._id) });
  }
  for (const list of byPerson.values()) list.sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return {
    sessionOf(person, when) {
      const t = ms(when);
      const list = byPerson.get(String(person));
      if (t === null || !list) return null;
      let found = null;
      for (const s of list) {
        if (s.at > t) break;
        found = s.key;
      }
      return found;
    },
  };
}

/**
 * The sessions Screen 2 excludes as rushed, as a Map of session id to its
 * reasons. Only IMAGE_SUBMITTED is read: a photo sent again is
 * IMAGE_RESUBMITTED (S20), so each photo is timed once.
 */
export function rushedSessions(sessions, telemetry, index = sessionIndex(sessions)) {
  const bySession = new Map();
  for (const ev of telemetry) {
    if (ev.event !== "IMAGE_SUBMITTED") continue;
    const key = index.sessionOf(ev.userId, ev.timestamp);
    if (key === null) continue;
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key).push(ev);
  }

  const excluded = new Map();
  for (const [key, events] of bySession) {
    const why = [];
    const durations = events.filter((e) => e.imageDurationMs != null).map((e) => e.imageDurationMs);
    if (durations.length && median(durations) < RUSHED_MEDIAN_IMAGE_MS) why.push("median_under_5s");

    const answered = events
      .flatMap((e) => e.suggestionConfidences || [])
      .filter((s) => s && s.disposition != null && s.disposition !== "hidden_below_tau");
    const times = answered.filter((s) => s.msToAnswer != null).map((s) => s.msToAnswer);
    if (
      answered.length &&
      times.length &&
      answered.every((s) => s.disposition === "accepted") &&
      times.reduce((a, b) => a + b, 0) / times.length < RUSHED_MEAN_ANSWER_MS
    ) {
      why.push("all_accepted_under_1s");
    }
    if (why.length) excluded.set(key, why);
  }
  return excluded;
}

/**
 * For each contributor with at least one counted photo:
 * `{ userKey, photos, lastPhotoAt }`, `lastPhotoAt` in milliseconds (null when
 * no counted annotation has a date).
 */
export async function countProperPhotos(db) {
  const [users, sessions, telemetry, annotations] = await Promise.all([
    db
      .collection("users")
      .find({ role: { $in: ["user", null] }, isPilot: { $ne: true } }, { projection: { _id: 1, role: 1, isPilot: 1 } })
      .toArray(),
    db.collection("sessions").find({}, { projection: { _id: 1, userId: 1, createdAt: 1 } }).toArray(),
    db
      .collection("telemetry_logs")
      .find(
        { event: "IMAGE_SUBMITTED" },
        { projection: { event: 1, userId: 1, timestamp: 1, imageDurationMs: 1, suggestionConfidences: 1 } },
      )
      .toArray(),
    db
      .collection("annotations")
      .find({ status: "completed", source: { $ne: "annotator" } }, { projection: { userId: 1, imageID: 1, date: 1 } })
      .toArray(),
  ]);

  const contributors = new Set(users.filter(isContributor).map((u) => String(u._id)));
  const index = sessionIndex(sessions);
  const excluded = rushedSessions(sessions, telemetry, index);

  // One annotation per person and photo. Were there ever two, the one saved last stands.
  const latest = new Map();
  for (const ann of annotations) {
    const person = String(ann.userId);
    if (!contributors.has(person)) continue;
    const id = `${person}|${String(ann.imageID)}`;
    const at = ms(ann.date);
    const kept = latest.get(id);
    if (!kept || (at ?? -Infinity) >= (kept.at ?? -Infinity)) latest.set(id, { person, at, date: ann.date });
  }

  const totals = new Map();
  for (const { person, at, date } of latest.values()) {
    const session = index.sessionOf(person, date);
    if (session !== null && excluded.has(session)) continue;
    const row = totals.get(person) || { userKey: person, photos: 0, lastPhotoAt: null };
    row.photos += 1;
    if (at !== null && (row.lastPhotoAt === null || at > row.lastPhotoAt)) row.lastPhotoAt = at;
    totals.set(person, row);
  }
  return [...totals.values()];
}

/**
 * The counts in board order with their ranks: most photos first, equal counts
 * by who got there first. Equal counts share a rank and the next rank skips
 * (1, 2, 2, 4).
 */
export function rankRows(counts) {
  const rows = [...counts].sort(
    (a, b) =>
      b.photos - a.photos ||
      (a.lastPhotoAt ?? Infinity) - (b.lastPhotoAt ?? Infinity) ||
      (a.userKey < b.userKey ? -1 : a.userKey > b.userKey ? 1 : 0),
  );
  let rank = 0;
  return rows.map((row, i) => {
    if (i === 0 || row.photos !== rows[i - 1].photos) rank = i + 1;
    return { ...row, rank };
  });
}

// Ranks and counts only, per database. Names are read fresh on every request,
// so a changed name choice shows on the next one.
let cache = new WeakMap();
let lastViewLogged = new Map();

/** For tests: forget the cached board and who was logged as viewing. */
export function resetLeaderboardState() {
  cache = new WeakMap();
  lastViewLogged = new Map();
}

async function rankedBoard(db, now) {
  const kept = cache.get(db);
  if (kept && now - kept.at < CACHE_MS) return kept;
  const rows = rankRows(await countProperPhotos(db));
  const fresh = { at: now, rows, byKey: new Map(rows.map((r) => [r.userKey, r])) };
  cache.set(db, fresh);
  return fresh;
}

/** An account's `_id` for a query: an ObjectId when the text is one */
export function toUserId(id) {
  const text = String(id);
  return /^[0-9a-fA-F]{24}$/.test(text) ? new ObjectId(text) : id;
}

/** "shown", "hidden", or null when the person has never answered (treated as hidden) */
export function nameChoiceOf(user) {
  return user?.leaderboardName === "shown" || user?.leaderboardName === "hidden" ? user.leaderboardName : null;
}

/**
 * The number in a hidden name, given once. The counter only goes up, so a
 * number is never given twice, and the account keeps the first one it gets
 * (two requests at once can skip a number, never share or change one).
 */
async function hiddenNumber(db, user) {
  if (Number.isInteger(user.leaderboardNumber)) return user.leaderboardNumber;
  const users = db.collection("users");
  const counter = await db
    .collection("counters")
    .findOneAndUpdate({ _id: "leaderboardNumber" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  await users.updateOne({ _id: user._id, leaderboardNumber: { $exists: false } }, { $set: { leaderboardNumber: counter.seq } });
  const saved = await users.findOne({ _id: user._id }, { projection: { leaderboardNumber: 1 } });
  // Kept on the copy in hand too, so the same person's second row asks for no other
  user.leaderboardNumber = saved.leaderboardNumber;
  return user.leaderboardNumber;
}

async function rowName(db, user) {
  if (nameChoiceOf(user) === "shown" && user.username) return user.username;
  return `${HIDDEN_NAME_PREFIX}${await hiddenNumber(db, user)}`;
}

/**
 * What GET /api/leaderboard answers:
 * `{ updatedAt, top: [{ rank, name, photos, isYou }], you }`.
 *
 * `you` is the viewer's own place wherever they are,
 * `{ rank, photos, name, nameChoice }`, or `{ rank: null, photos: 0, nameChoice }`
 * before their first counted photo. It is null for anyone who is not a
 * contributor by role (an admin).
 */
export async function buildLeaderboard(db, viewerId, { now = Date.now() } = {}) {
  const board = await rankedBoard(db, now);
  const viewerKey = String(viewerId);
  const topRows = board.rows.slice(0, TOP_COUNT);
  const viewerRow = board.byKey.get(viewerKey) || null;

  const needed = [...new Set([...topRows.map((r) => r.userKey), viewerKey])];
  const found = await db
    .collection("users")
    .find(
      { _id: { $in: needed.map(toUserId) } },
      { projection: { username: 1, role: 1, leaderboardName: 1, leaderboardNumber: 1 } },
    )
    .toArray();
  const userOf = new Map(found.map((u) => [String(u._id), u]));

  // One at a time, in board order, so numbers are handed out in that order
  const top = [];
  for (const row of topRows) {
    const user = userOf.get(row.userKey);
    if (!user) continue;
    top.push({ rank: row.rank, name: await rowName(db, user), photos: row.photos, isYou: row.userKey === viewerKey });
  }

  const viewer = userOf.get(viewerKey);
  let you = null;
  if (viewer && (viewer.role === "user" || viewer.role == null)) {
    const nameChoice = nameChoiceOf(viewer);
    you = viewerRow
      ? { rank: viewerRow.rank, photos: viewerRow.photos, name: await rowName(db, viewer), nameChoice }
      : { rank: null, photos: 0, nameChoice };
  }

  return { updatedAt: new Date(board.at).toISOString(), top, you };
}

/** True when this person's view should be logged now, and remembers that it was. */
export function shouldLogView(userKey, now = Date.now()) {
  const key = String(userKey);
  const last = lastViewLogged.get(key);
  if (last !== undefined && now - last < VIEW_LOG_GAP_MS) return false;
  lastViewLogged.set(key, now);
  return true;
}
