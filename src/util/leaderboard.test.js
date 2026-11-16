import { describe, it, expect, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { createFakeDb } from "@/test-utils/fakeMongo";
import fixture from "./leaderboard.fixture.json";
import {
  RUSHED_MEDIAN_IMAGE_MS,
  RUSHED_MEAN_ANSWER_MS,
  TOP_COUNT,
  CACHE_MS,
  VIEW_LOG_GAP_MS,
  HIDDEN_NAME_PREFIX,
  isContributor,
  sessionIndex,
  rushedSessions,
  countProperPhotos,
  rankRows,
  buildLeaderboard,
  shouldLogView,
  resetLeaderboardState,
} from "./leaderboard.mjs";

/**
 * S32 (17 Nov 2026): the contributors' leaderboard. The count on a fake
 * database, the ranking, and the names.
 */
const U = (n) => n.toString(16).padStart(24, "0");
const T0 = Date.parse("2026-11-10T01:00:00.000Z");
const at = (minutes) => new Date(T0 + minutes * 60000);

beforeEach(() => resetLeaderboardState());

/**
 * One contributor, one session started at T0, with one IMAGE_SUBMITTED event
 * per entry of `events` ({ ms, answers: [[disposition, msToAnswer], ...] })
 * and `photos` annotations saved in it.
 */
function oneSession({ events = [], photos = 2, user = { role: "user" } } = {}) {
  const person = U(1);
  return createFakeDb({
    users: [{ _id: person, username: "alon", ...user }],
    sessions: [{ _id: "s1", userId: person, createdAt: at(0) }],
    telemetry_logs: events.map((e, i) => ({
      event: e.event || "IMAGE_SUBMITTED",
      userId: person,
      timestamp: at(1 + i),
      ...(e.ms === undefined ? {} : { imageDurationMs: e.ms }),
      suggestionConfidences: (e.answers || []).map(([disposition, msToAnswer]) => ({
        ...(disposition === undefined ? {} : { disposition }),
        ...(msToAnswer === undefined ? {} : { msToAnswer }),
      })),
    })),
    annotations: Array.from({ length: photos }, (_, i) => ({
      userId: person, imageID: 100 + i, status: "completed", date: at(1 + i),
    })),
  }).db;
}
const photosOf = async (db, person = U(1)) => (await countProperPhotos(db)).find((r) => r.userKey === person)?.photos ?? 0;

describe("the thresholds", () => {
  it("are §7af's, as screens.py has them", () => {
    expect(RUSHED_MEDIAN_IMAGE_MS).toBe(5000);
    expect(RUSHED_MEAN_ANSWER_MS).toBe(1000);
    expect(TOP_COUNT).toBe(20);
    expect(CACHE_MS).toBe(5 * 60 * 1000);
    expect(VIEW_LOG_GAP_MS).toBe(10 * 60 * 1000);
  });
});

describe("countProperPhotos: a session with a median photo time under 5 s", () => {
  it("is excluded, and its photos do not count", async () => {
    expect(await photosOf(oneSession({ events: [{ ms: 4999 }, { ms: 4999 }, { ms: 60000 }] }))).toBe(0);
  });

  it("is not excluded at exactly 5 s", async () => {
    expect(await photosOf(oneSession({ events: [{ ms: 5000 }, { ms: 5000 }, { ms: 1000 }] }))).toBe(2);
  });

  it("takes the mean of the two middle times for an even number of photos", async () => {
    expect(await photosOf(oneSession({ events: [{ ms: 4000 }, { ms: 5999 }] }))).toBe(0); // 4999.5
    expect(await photosOf(oneSession({ events: [{ ms: 4000 }, { ms: 6000 }] }))).toBe(2); // 5000
  });

  it("leaves out events with no imageDurationMs", async () => {
    expect(await photosOf(oneSession({ events: [{}, {}, { ms: 9000 }] }))).toBe(2);
    expect(await photosOf(oneSession({ events: [{}, {}, {}] }))).toBe(2);
  });
});

describe("countProperPhotos: a session where every answered suggestion was accepted", () => {
  const session = (answers) => oneSession({ events: [{ ms: 9000, answers }] });

  it("is excluded at a mean under 1 s", async () => {
    expect(await photosOf(session([["accepted", 500], ["accepted", 1499]]))).toBe(0);
  });

  it("is not excluded at a mean of exactly 1 s", async () => {
    expect(await photosOf(session([["accepted", 500], ["accepted", 1500]]))).toBe(2);
  });

  it("is not excluded with a single relabel", async () => {
    expect(await photosOf(session([["accepted", 100], ["accepted", 100], ["relabeled", 100]]))).toBe(2);
  });

  it("leaves hidden_below_tau and missing dispositions out of the check", async () => {
    // Neither stops "all accepted", and neither's time is in the mean
    expect(await photosOf(session([["accepted", 400], ["hidden_below_tau", 90000], [undefined, 90000]]))).toBe(0);
    // With only those, nothing was answered
    expect(await photosOf(session([["hidden_below_tau", 10], [undefined, 10]]))).toBe(2);
  });

  it("is not excluded when no answer has a time", async () => {
    expect(await photosOf(session([["accepted"], ["accepted"]]))).toBe(2);
  });

  it("takes the mean over the times present, across the session's photos", async () => {
    const db = oneSession({ events: [{ ms: 9000, answers: [["accepted", 1900], ["accepted"]] }, { ms: 9000, answers: [["accepted", 50]] }] });
    expect(await photosOf(db)).toBe(0); // (1900 + 50) / 2
  });
});

describe("countProperPhotos: placing events and photos in sessions", () => {
  it("ignores IMAGE_RESUBMITTED", async () => {
    const db = oneSession({ events: [{ ms: 9000 }, { ms: 100, event: "IMAGE_RESUBMITTED" }, { ms: 100, event: "IMAGE_RESUBMITTED" }] });
    expect(await photosOf(db)).toBe(2);
  });

  it("puts each event and photo in the latest session started at or before it", async () => {
    const person = U(1);
    const { db } = createFakeDb({
      users: [{ _id: person, role: "user" }],
      sessions: [
        { _id: "rushed", userId: person, createdAt: at(0) },
        { _id: "fine", userId: person, createdAt: at(60) },
      ],
      telemetry_logs: [
        { event: "IMAGE_SUBMITTED", userId: person, timestamp: at(1), imageDurationMs: 1000 },
        // Exactly at the second session's start: the second session's
        { event: "IMAGE_SUBMITTED", userId: person, timestamp: at(60), imageDurationMs: 9000 },
      ],
      annotations: [
        { userId: person, imageID: 1, status: "completed", date: at(2) },
        { userId: person, imageID: 2, status: "completed", date: at(59) },
        { userId: person, imageID: 3, status: "completed", date: at(60) },
        { userId: person, imageID: 4, status: "completed", date: at(500) },
      ],
    });
    const [row] = await countProperPhotos(db);
    expect(row).toEqual({ userKey: person, photos: 2, lastPhotoAt: at(500).getTime() });
  });

  it("gives an event before the person's first session to none, and counts a photo with no session", async () => {
    const person = U(1);
    const { db } = createFakeDb({
      users: [{ _id: person, role: "user" }],
      sessions: [{ _id: "later", userId: person, createdAt: at(60) }],
      telemetry_logs: [{ event: "IMAGE_SUBMITTED", userId: person, timestamp: at(1), imageDurationMs: 100 }],
      annotations: [
        { userId: person, imageID: 1, status: "completed", date: at(2) },
        { userId: person, imageID: 2, status: "completed", date: at(61) },
        { userId: person, imageID: 3, status: "completed" },
      ],
    });
    expect(await photosOf(db)).toBe(3);
  });

  it("counts the photos of a session with no telemetry", async () => {
    expect(await photosOf(oneSession({ events: [], photos: 3 }))).toBe(3);
  });

  it("never places anything in another person's session", async () => {
    const [a, b] = [U(1), U(2)];
    const { db } = createFakeDb({
      users: [{ _id: a, role: "user" }, { _id: b, role: "user" }],
      sessions: [{ _id: "a-rushed", userId: a, createdAt: at(0) }],
      telemetry_logs: [{ event: "IMAGE_SUBMITTED", userId: a, timestamp: at(1), imageDurationMs: 100 }],
      annotations: [
        { userId: a, imageID: 1, status: "completed", date: at(1) },
        { userId: b, imageID: 1, status: "completed", date: at(1) },
      ],
    });
    expect(await countProperPhotos(db)).toEqual([{ userKey: b, photos: 1, lastPhotoAt: at(1).getTime() }]);
  });

  it("skips a session with no createdAt", () => {
    const index = sessionIndex([{ _id: "x", userId: U(1) }, { _id: "y", userId: U(1), createdAt: at(0) }]);
    expect(index.sessionOf(U(1), at(5))).toBe("y");
    expect(index.sessionOf(U(1), at(-5))).toBeNull();
    expect(index.sessionOf(U(1), null)).toBeNull();
    expect(index.sessionOf(U(9), at(5))).toBeNull();
  });
});

describe("countProperPhotos: who and what counts", () => {
  it("never counts annotators, admins or pilots, and counts an account with no role", async () => {
    const people = [
      { _id: U(1), role: "user" },
      { _id: U(2) },
      { _id: U(3), role: "annotator" },
      { _id: U(4), role: "admin" },
      { _id: U(5), role: "user", isPilot: true },
    ];
    const { db } = createFakeDb({
      users: people,
      annotations: people.map((p) => ({ userId: p._id, imageID: 1, status: "completed", date: at(1) })),
    });
    expect((await countProperPhotos(db)).map((r) => r.userKey).sort()).toEqual([U(1), U(2)]);
    expect(people.map(isContributor)).toEqual([true, true, false, false, false]);
    expect(isContributor(null)).toBe(false);
  });

  it("leaves out an annotator's annotations and anything not completed", async () => {
    const { db } = createFakeDb({
      users: [{ _id: U(1), role: "user" }],
      annotations: [
        { userId: U(1), imageID: 1, status: "completed", date: at(1) },
        { userId: U(1), imageID: 2, status: "completed", source: "annotator", date: at(2) },
        { userId: U(1), imageID: 3, status: "active", date: at(3) },
      ],
    });
    expect(await photosOf(db)).toBe(1);
  });

  it("counts a photo once", async () => {
    const { db } = createFakeDb({
      users: [{ _id: U(1), role: "user" }],
      annotations: [
        { userId: U(1), imageID: 7, status: "completed", date: at(1) },
        { userId: U(1), imageID: 7, status: "completed", date: at(2) },
      ],
    });
    expect(await photosOf(db)).toBe(1);
  });

  it("matches userId stored as a string and as an ObjectId", async () => {
    const person = U(1);
    const { db } = createFakeDb({
      users: [{ _id: new ObjectId(person), role: "user" }],
      sessions: [{ _id: new ObjectId(U(50)), userId: person, createdAt: at(0) }],
      telemetry_logs: [{ event: "IMAGE_SUBMITTED", userId: new ObjectId(person), timestamp: at(1), imageDurationMs: 100 }],
      annotations: [
        { userId: person, imageID: 1, status: "completed", date: at(1) },
        { userId: new ObjectId(person), imageID: 2, status: "completed", date: at(2) },
        { userId: new ObjectId(person), imageID: 3, status: "completed", date: at(-10) },
      ],
    });
    // Two in the rushed session whichever way the id is stored, one before it
    expect(await countProperPhotos(db)).toEqual([{ userKey: person, photos: 1, lastPhotoAt: at(-10).getTime() }]);
  });
});

describe("the shared fixture (leaderboard.fixture.json, also run through screens.py screen2)", () => {
  const { users, sessions, telemetry_logs, annotations } = fixture;
  const { db } = createFakeDb({ users, sessions, telemetry_logs, annotations });

  it("excludes the sessions written in it", () => {
    const excluded = rushedSessions(fixture.sessions, fixture.telemetry_logs);
    expect([...excluded.keys()].sort()).toEqual(fixture.expected.excludedSessions);
    expect(excluded.get("session-02")).toEqual(["median_under_5s"]);
    expect(excluded.get("session-04")).toEqual(["all_accepted_under_1s"]);
  });

  it("counts the photos written in it", async () => {
    const want = fixture.expected.counts.map((c) => ({ ...c, lastPhotoAt: Date.parse(c.lastPhotoAt) }));
    expect(rankRows(await countProperPhotos(db)).map(({ rank, ...row }) => row)).toEqual(want); // eslint-disable-line @typescript-eslint/no-unused-vars -- the rank is checked below
  });
});

describe("rankRows", () => {
  const row = (userKey, photos, lastPhotoAt) => ({ userKey, photos, lastPhotoAt });

  it("orders by most photos, equal counts by the earlier last photo", () => {
    const ranked = rankRows([row("a", 3, 50), row("b", 9, 99), row("c", 3, 10), row("d", 5, 1)]);
    expect(ranked.map((r) => r.userKey)).toEqual(["b", "d", "c", "a"]);
  });

  it("shares a rank between equal counts, and the next rank skips", () => {
    const ranked = rankRows([row("a", 9, 1), row("b", 5, 2), row("c", 5, 1), row("d", 2, 1), row("e", 2, 2), row("f", 2, 3), row("g", 1, 1)]);
    expect(ranked.map((r) => [r.userKey, r.rank])).toEqual([["a", 1], ["c", 2], ["b", 2], ["d", 4], ["e", 4], ["f", 4], ["g", 7]]);
  });

  it("puts a row with no date after the dated ones of the same count, and is empty for none", () => {
    expect(rankRows([row("a", 2, null), row("b", 2, 5)]).map((r) => r.userKey)).toEqual(["b", "a"]);
    expect(rankRows([])).toEqual([]);
  });
});

/** `n` contributors, the i-th (from 1) with n + 1 - i photos, so U(1) is first. No sessions. */
function crowd(n, extra = {}) {
  const users = [];
  const annotations = [];
  for (let i = 1; i <= n; i++) {
    users.push({ _id: U(i), username: `person${i}`, email: `person${i}@example.com`, role: "user", ...(extra[i] || {}) });
    for (let p = 0; p < n + 1 - i; p++) annotations.push({ userId: U(i), imageID: p, status: "completed", date: at(i) });
  }
  return createFakeDb({ users, annotations });
}

describe("buildLeaderboard: the board", () => {
  it("returns the top 20 and marks the viewer's row", async () => {
    const { db } = crowd(25);
    const board = await buildLeaderboard(db, U(3));
    expect(board.top).toHaveLength(20);
    expect(board.top.map((r) => r.rank)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(board.top[0].photos).toBe(25);
    expect(board.top.filter((r) => r.isYou)).toEqual([board.top[2]]);
    expect(board.you).toMatchObject({ rank: 3, photos: 23, nameChoice: null });
    expect(board.you.name).toBe(board.top[2].name);
  });

  it("gives the viewer's place and count when they are below the top 20", async () => {
    const { db } = crowd(25);
    const board = await buildLeaderboard(db, U(24));
    expect(board.top.some((r) => r.isYou)).toBe(false);
    expect(board.you).toMatchObject({ rank: 24, photos: 2 });
    expect(board.you.name).toMatch(/^Imprint Contributor #\d+$/);
  });

  it("gives a contributor with no counted photo a place of null and 0 photos", async () => {
    const { db } = crowd(3);
    await db.collection("users").insertOne({ _id: U(90), username: "newcomer", role: "user", leaderboardName: "hidden" });
    await db.collection("users").insertOne({ _id: U(91), username: "pilot", role: "user", isPilot: true });
    expect((await buildLeaderboard(db, U(90))).you).toEqual({ rank: null, photos: 0, nameChoice: "hidden" });
    expect((await buildLeaderboard(db, U(91))).you).toEqual({ rank: null, photos: 0, nameChoice: null });
    // Neither was given a number: they are not on the board
    expect(await db.collection("users").findOne({ _id: U(90) })).not.toHaveProperty("leaderboardNumber");
  });

  it("gives an admin, an annotator and an unknown viewer no place", async () => {
    const { db } = crowd(3);
    await db.collection("users").insertOne({ _id: U(80), username: "boss", role: "admin" });
    await db.collection("users").insertOne({ _id: U(81), username: "paid", role: "annotator" });
    expect((await buildLeaderboard(db, U(80))).you).toBeNull();
    expect((await buildLeaderboard(db, U(81))).you).toBeNull();
    const board = await buildLeaderboard(db, U(99));
    expect(board.you).toBeNull();
    expect(board.top).toHaveLength(3);
  });

  it("is empty with no contributors", async () => {
    const { db } = createFakeDb({});
    expect(await buildLeaderboard(db, U(1))).toMatchObject({ top: [], you: null });
  });

  it("keeps the counts for 5 minutes, then counts again", async () => {
    const { db } = crowd(2);
    const now = Date.parse("2026-11-17T00:00:00.000Z");
    const first = await buildLeaderboard(db, U(2), { now });
    expect(first.you.photos).toBe(1);
    expect(first.updatedAt).toBe("2026-11-17T00:00:00.000Z");

    await db.collection("annotations").insertOne({ userId: U(2), imageID: 500, status: "completed", date: at(900) });
    const cached = await buildLeaderboard(db, U(2), { now: now + CACHE_MS - 1 });
    expect(cached.you.photos).toBe(1);
    expect(cached.updatedAt).toBe(first.updatedAt);

    const fresh = await buildLeaderboard(db, U(2), { now: now + CACHE_MS });
    expect(fresh.you.photos).toBe(2);
    expect(Date.parse(fresh.updatedAt)).toBe(now + CACHE_MS);
  });

  it("sends a name and a count and nothing else", async () => {
    const { db } = crowd(25, { 2: { leaderboardName: "shown" } });
    const board = await buildLeaderboard(db, U(24));
    for (const row of board.top) expect(Object.keys(row).sort()).toEqual(["isYou", "name", "photos", "rank"]);
    expect(Object.keys(board.you).sort()).toEqual(["name", "nameChoice", "photos", "rank"]);
    const sent = JSON.stringify(board);
    expect(sent).not.toMatch(/[0-9a-f]{24}/);
    expect(sent).not.toContain("@");
    // Only the one who chose to show it is named
    expect(sent.match(/person\d+/g)).toEqual(["person2"]);
  });
});

describe("buildLeaderboard: names", () => {
  it("shows a username only for someone who chose it, and a number for hidden and never-answered rows", async () => {
    const { db } = crowd(3, { 1: { leaderboardName: "shown" }, 2: { leaderboardName: "hidden" } });
    const board = await buildLeaderboard(db, U(1));
    expect(board.top.map((r) => r.name)).toEqual(["person1", `${HIDDEN_NAME_PREFIX}1`, `${HIDDEN_NAME_PREFIX}2`]);
    expect(board.you.nameChoice).toBe("shown");
  });

  it("gives a number once: it is the same on every later request", async () => {
    const { db, collections } = crowd(3);
    const first = (await buildLeaderboard(db, U(2))).top.map((r) => r.name);
    const second = (await buildLeaderboard(db, U(3))).top.map((r) => r.name);
    expect(second).toEqual(first);
    expect(collections.users.rows.map((u) => u.leaderboardNumber)).toEqual([1, 2, 3]);
    expect(collections.counters.rows).toEqual([{ _id: "leaderboardNumber", seq: 3 }]);
  });

  it("never gives two contributors the same number", async () => {
    const { db } = crowd(25);
    const names = new Set();
    for (const viewer of [1, 21, 22, 23, 24, 25, 21]) {
      const board = await buildLeaderboard(db, U(viewer));
      for (const row of board.top) names.add(row.name);
      names.add(board.you.name);
    }
    expect(names.size).toBe(25);
  });

  it("gives no number to someone shown, and keeps a number through showing and hiding again", async () => {
    const { db, collections } = crowd(2, { 1: { leaderboardName: "shown" } });
    const users = db.collection("users");
    expect((await buildLeaderboard(db, U(1))).top.map((r) => r.name)).toEqual(["person1", `${HIDDEN_NAME_PREFIX}1`]);
    expect(collections.users.rows[0]).not.toHaveProperty("leaderboardNumber");

    // The second shows their username: the change is there on the next request, inside the 5 minutes
    await users.updateOne({ _id: U(2) }, { $set: { leaderboardName: "shown" } });
    expect((await buildLeaderboard(db, U(1))).top.map((r) => r.name)).toEqual(["person1", "person2"]);

    // Both hide: the second keeps number 1, the first gets the next one
    await users.updateOne({ _id: U(1) }, { $set: { leaderboardName: "hidden" } });
    await users.updateOne({ _id: U(2) }, { $set: { leaderboardName: "hidden" } });
    expect((await buildLeaderboard(db, U(1))).top.map((r) => r.name)).toEqual([`${HIDDEN_NAME_PREFIX}2`, `${HIDDEN_NAME_PREFIX}1`]);
  });

  it("keeps the number already on the account when another request got there first", async () => {
    const { db } = crowd(1);
    const users = db.collection("users");
    // As a second request would between this one's counter step and its write
    const counters = db.collection("counters");
    const realStep = counters.findOneAndUpdate.bind(counters);
    counters.findOneAndUpdate = async (...args) => {
      const stepped = await realStep(...args);
      await users.updateOne({ _id: U(1) }, { $set: { leaderboardNumber: 77 } });
      return stepped;
    };
    expect((await buildLeaderboard(db, U(1))).you.name).toBe(`${HIDDEN_NAME_PREFIX}77`);
    expect((await users.findOne({ _id: U(1) })).leaderboardNumber).toBe(77);
  });

  it("shows a number for someone who chose to be shown but has no username", async () => {
    const { db } = createFakeDb({
      users: [{ _id: U(1), role: "user", leaderboardName: "shown" }],
      annotations: [{ userId: U(1), imageID: 1, status: "completed", date: at(1) }],
    });
    expect((await buildLeaderboard(db, U(1))).top[0].name).toBe(`${HIDDEN_NAME_PREFIX}1`);
  });
});

describe("shouldLogView", () => {
  it("is true once per person in 10 minutes", () => {
    const now = 1_000_000;
    expect(shouldLogView("a", now)).toBe(true);
    expect(shouldLogView("a", now + VIEW_LOG_GAP_MS - 1)).toBe(false);
    expect(shouldLogView("b", now + 1)).toBe(true);
    expect(shouldLogView("a", now + VIEW_LOG_GAP_MS)).toBe(true);
    expect(shouldLogView("a", now + VIEW_LOG_GAP_MS + 5)).toBe(false);
  });
});
