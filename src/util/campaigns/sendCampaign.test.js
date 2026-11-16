import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ObjectId } from "mongodb";
import { createFakeDb } from "@/test-utils/fakeMongo";
import { sendCampaign, SEND_BY_HAND_FIRST, shortError, autosendCampaigns, SENT_EVENT, FEED_LIMIT } from "./sendCampaign.mjs";
import { hasUnreadMessage } from "@/util/notifications.mjs";
import { trayEntries } from "@/features/navbarMain/navCopy";

/**
 * The campaign sender (S29, 16 Nov 2026), on an in-memory database and a fake
 * transport: no test sends a real email.
 */
const NOW = new Date("2026-11-16T01:30:00Z");
const HOUR = 60 * 60 * 1000;
const ago = (hours) => new Date(NOW.getTime() - hours * HOUR);
const oid = (n) => new ObjectId(String(n).padStart(24, "0"));
const ENV = { NEXTAUTH_URL: "https://imprint.example.org", NEXTAUTH_SECRET: "test-secret", EMAIL_USER: "imprint@example.org", EMAIL_PASS: "x" };

const contributor = (n, extra = {}) => ({
  _id: oid(n),
  role: "user",
  username: `user${n}`,
  email: `user${n}@example.org`,
  emailVerifiedAt: ago(200),
  createdAt: ago(100),
  activities: [],
  ...extra,
});
const admin = { _id: oid(900), role: "admin", username: "rans-admin", email: "rans@example.org", emailVerifiedAt: ago(500), createdAt: ago(900) };

let transport;
let sleep;
beforeEach(() => {
  transport = { sendMail: vi.fn(async () => ({ messageId: "x" })) };
  sleep = vi.fn(async () => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function setup(users, seed = {}) {
  return createFakeDb({ users, annotations: [], email_sends: [], telemetry_logs: [], ...seed });
}

const run = (db, options) => sendCampaign({ db, transport, sleep, env: ENV, now: () => NOW, campaign: "welcome-nudge", ...options });

/** Nothing that names a person: no address, username or id anywhere. */
function expectNoPerson(result, users) {
  const json = JSON.stringify(result);
  for (const u of users) {
    expect(json).not.toContain(u.email);
    expect(json).not.toContain(u.username);
    expect(json).not.toContain(String(u._id));
  }
  expect(json).not.toContain("@");
}

describe("sendCampaign, dry", () => {
  it("sends and writes nothing, and answers counts only", async () => {
    const users = [contributor(1), contributor(2, { emailVerifiedAt: null }), contributor(3, { isPilot: true }), contributor(4, { createdAt: ago(10) })];
    const { db, collections } = setup(users);
    const result = await run(db, { mode: "dry", limit: 1 });
    expect(result).toEqual({
      ok: true,
      campaign: "welcome-nudge",
      mode: "dry",
      audience: 2,
      byVariant: { start: 1, confirm: 1 },
      excluded: { noEmail: 0, pilot: 1, optedOut: 0, tooNew: 1, hasAnnotation: 0, alreadySent: 0, failedBefore: 0 },
      wouldSendThisRun: 1,
      limit: 1,
    });
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(collections.email_sends.rows).toHaveLength(0);
    expect(collections.telemetry_logs.rows).toHaveLength(0);
    expect(collections.users.rows.every((u) => u.activities.length === 0)).toBe(true);
    expectNoPerson(result, users);
  });
});

describe("sendCampaign, preview", () => {
  it("refuses a non-admin and an unknown username, and sends and writes nothing", async () => {
    const { db, collections } = setup([contributor(1), admin]);
    for (const previewTo of ["user1", "nobody", "", undefined]) {
      const result = await run(db, { mode: "preview", previewTo });
      expect(result.ok).toBe(false);
    }
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(collections.users.rows.find((u) => u.username === "user1").activities).toEqual([]);
    expect(collections.users.rows.find((u) => u.role === "admin").activities).toBeUndefined();
    expect(collections.email_sends.rows).toHaveLength(0);
    expect(collections.telemetry_logs.rows).toHaveLength(0);
  });

  it("writes exactly two bell messages, both to the admin and both starting [Preview], and no send record or telemetry", async () => {
    const users = [contributor(1), contributor(2), { ...admin, activities: [{ tag: "register", activity: "Registered to Imprint", date: ago(900) }] }];
    const { db, collections } = setup(users);
    await run(db, { mode: "preview", previewTo: "rans-admin" });
    const adminFeed = collections.users.rows.find((u) => u.role === "admin").activities;
    const messages = adminFeed.filter((a) => a.tag === "message");
    expect(messages).toEqual([
      { tag: "message", title: "[Preview] Your first session is waiting", activity: "Start with 5 photos, about 5 minutes.", date: NOW, campaign: "welcome-nudge" },
      { tag: "message", title: "[Preview] Confirm your email", activity: "Please confirm your email to start annotating.", date: NOW, campaign: "welcome-nudge" },
    ]);
    expect(adminFeed[0].tag).toBe("register");
    expect(collections.users.rows.filter((u) => u.role !== "admin").every((u) => u.activities.length === 0)).toBe(true);
    expect(collections.email_sends.rows).toHaveLength(0);
    expect(collections.telemetry_logs.rows).toHaveLength(0);
  });

  it("gives the admin the bell's dot for the preview messages", async () => {
    const { db, collections } = setup([{ ...admin, notificationsSeenAt: ago(1) }]);
    await run(db, { mode: "preview", previewTo: "rans-admin" });
    const row = collections.users.rows[0];
    expect(hasUnreadMessage(row.activities, row.notificationsSeenAt)).toBe(true);
    expect(trayEntries(row.activities, row.notificationsSeenAt).unread.map((m) => m.title)).toEqual([
      "[Preview] Your first session is waiting",
      "[Preview] Confirm your email",
    ]);
  });

  it("sends both variants to the admin with [Preview], and answers previewSent and previewBell", async () => {
    const users = [contributor(1), admin];
    const { db, collections } = setup(users);
    const result = await run(db, { mode: "preview", previewTo: "rans-admin" });
    expect(result).toEqual({ ok: true, campaign: "welcome-nudge", mode: "preview", previewSent: 2, previewBell: 2 });
    expect(transport.sendMail).toHaveBeenCalledTimes(2);
    const mails = transport.sendMail.mock.calls.map(([m]) => m);
    expect(mails.map((m) => m.to)).toEqual(["rans@example.org", "rans@example.org"]);
    expect(mails.map((m) => m.subject)).toEqual(["[Preview] Your first sidewalk is waiting on Imprint", "[Preview] One step left to start on Imprint"]);
    // The stop link is real, signed for the admin
    for (const m of mails) expect(m.text).toContain(`u=${admin._id}`);
    expect(collections.email_sends.rows).toHaveLength(0);
    expect(collections.telemetry_logs.rows).toHaveLength(0);
    expect(collections.users.rows.find((u) => u.role !== "admin").activities).toEqual([]);
    expectNoPerson(result, users);
  });
});

describe("sendCampaign, apply", () => {
  it("sends each person once, with the record, the bell message and the telemetry event, and a second apply sends nothing", async () => {
    const users = [contributor(1), contributor(2, { emailVerifiedAt: null }), contributor(3, { role: "annotator" })];
    const { db, collections } = setup(users);
    const result = await run(db, { mode: "apply" });
    expect(result).toMatchObject({ ok: true, mode: "apply", trigger: "manual", sent: 2, failed: 0, skipped: 0, notRecorded: 0, left: 0 });
    expectNoPerson(result, users);
    expect(transport.sendMail.mock.calls.map(([m]) => m.to).sort()).toEqual(["user1@example.org", "user2@example.org"]);

    const sends = collections.email_sends.rows;
    expect(sends.map(({ campaign, userId, variant, trigger, status }) => ({ campaign, userId, variant, trigger, status }))).toEqual([
      { campaign: "welcome-nudge", userId: oid(1).toString(), variant: "start", trigger: "manual", status: "sent" },
      { campaign: "welcome-nudge", userId: oid(2).toString(), variant: "confirm", trigger: "manual", status: "sent" },
    ]);
    expect(sends.every((s) => s.sentAt instanceof Date)).toBe(true);
    // No address or username in the send record
    expect(JSON.stringify(sends)).not.toContain("@");
    expect(JSON.stringify(sends)).not.toContain("user1");

    const feed = collections.users.rows.find((u) => String(u._id) === oid(1).toString()).activities;
    expect(feed).toEqual([{ tag: "message", title: "Your first session is waiting", activity: "Start with 5 photos, about 5 minutes.", date: NOW, campaign: "welcome-nudge" }]);
    expect(collections.users.rows.find((u) => u.role === "annotator").activities).toEqual([]);

    expect(collections.telemetry_logs.rows.map(({ event, campaign, variant, trigger, userId }) => ({ event, campaign, variant, trigger, userId }))).toEqual([
      { event: SENT_EVENT, campaign: "welcome-nudge", variant: "start", trigger: "manual", userId: oid(1).toString() },
      { event: SENT_EVENT, campaign: "welcome-nudge", variant: "confirm", trigger: "manual", userId: oid(2).toString() },
    ]);

    transport.sendMail.mockClear();
    const again = await run(db, { mode: "apply" });
    expect(again).toMatchObject({ sent: 0, failed: 0, left: 0 });
    expect(again.excluded.alreadySent).toBe(2);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it("creates the unique index before its first send", async () => {
    const { db, collections } = setup([contributor(1)]);
    const spy = vi.spyOn(collections.email_sends, "createIndex");
    await run(db, { mode: "apply" });
    expect(spy).toHaveBeenCalledWith({ campaign: 1, userId: 1 }, { unique: true, name: "uniq_campaign_user" });
  });

  it("skips a person another run claimed first (a duplicate key), without sending", async () => {
    const { db, collections } = setup([contributor(1), contributor(2)]);
    await collections.email_sends.createIndex({ campaign: 1, userId: 1 }, { unique: true });
    const insert = collections.email_sends.insertOne.bind(collections.email_sends);
    // Another run claims user 2 between this run's read and its claim
    vi.spyOn(collections.email_sends, "insertOne").mockImplementation(async (doc) => {
      if (doc.userId === oid(2).toString() && !collections.email_sends.rows.some((r) => r.userId === doc.userId)) {
        await insert({ ...doc, trigger: "auto" });
      }
      return insert(doc);
    });
    const result = await run(db, { mode: "apply" });
    expect(result).toMatchObject({ sent: 1, skipped: 1 });
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });

  it("respects limit, says how many are left, and pauses between sends only", async () => {
    const { db } = setup([1, 2, 3, 4, 5].map((n) => contributor(n)));
    const result = await run(db, { mode: "apply", limit: 3, pauseMs: 10 });
    expect(result).toMatchObject({ sent: 3, left: 2, limit: 3 });
    expect(transport.sendMail).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
    const rest = await run(db, { mode: "apply", limit: 3, pauseMs: 0 });
    expect(rest).toMatchObject({ sent: 2, left: 0 });
  });

  it("refuses a limit or pause out of range", async () => {
    const { db } = setup([contributor(1)]);
    for (const opts of [{ limit: 0 }, { limit: 201 }, { limit: 2.5 }, { limit: "x" }, { pauseMs: -1 }, { pauseMs: 60001 }]) {
      expect((await run(db, { mode: "apply", ...opts })).ok).toBe(false);
    }
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it("keeps the feed to its last 100 entries", async () => {
    const full = Array.from({ length: FEED_LIMIT }, (_, i) => ({ tag: "register", activity: `old ${i}`, date: ago(1000) }));
    const { db, collections } = setup([contributor(1, { activities: full })]);
    await run(db, { mode: "apply" });
    const feed = collections.users.rows[0].activities;
    expect(feed).toHaveLength(FEED_LIMIT);
    expect(feed[0].activity).toBe("old 1");
    expect(feed.at(-1).tag).toBe("message");
  });

  it("records a send that throws as failed, with a short error and no address, and retry-failed sends it again", async () => {
    const users = [contributor(1), contributor(2)];
    const { db, collections } = setup(users);
    transport.sendMail.mockImplementationOnce(async () => {
      const err = new Error("Mail to user1@example.org refused");
      err.responseCode = 550;
      throw err;
    });
    const first = await run(db, { mode: "apply" });
    expect(first).toMatchObject({ sent: 1, failed: 1 });
    expectNoPerson(first, users);
    const failed = collections.email_sends.rows.find((r) => r.status === "failed");
    expect(failed.error).toBe("SMTP 550");
    expect(JSON.stringify(failed)).not.toContain("@");
    // A failed send has no bell message or event
    expect(collections.telemetry_logs.rows).toHaveLength(1);

    // apply leaves it alone
    transport.sendMail.mockClear();
    expect(await run(db, { mode: "apply" })).toMatchObject({ sent: 0 });
    expect(transport.sendMail).not.toHaveBeenCalled();

    const retry = await run(db, { mode: "retry-failed" });
    expect(retry).toMatchObject({ ok: true, mode: "retry-failed", sent: 1, failed: 0 });
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    const row = collections.email_sends.rows.find((r) => r.userId === failed.userId);
    expect(row.status).toBe("sent");
    expect(row.error).toBeUndefined();
    expect(row.trigger).toBe("manual");
    expect(collections.telemetry_logs.rows).toHaveLength(2);
    expect(collections.email_sends.rows).toHaveLength(2);

    // Nothing left to retry
    transport.sendMail.mockClear();
    expect(await run(db, { mode: "retry-failed" })).toMatchObject({ sent: 0 });
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it("does not retry a failed send for someone who has since opted out or annotated", async () => {
    const { db } = setup([contributor(1, { emailOptOutAt: ago(1) }), contributor(2)], {
      annotations: [{ userId: oid(2), status: "completed" }],
      email_sends: [
        { campaign: "welcome-nudge", userId: oid(1).toString(), status: "failed", trigger: "manual" },
        { campaign: "welcome-nudge", userId: oid(2).toString(), status: "failed", trigger: "manual" },
      ],
    });
    expect(await run(db, { mode: "retry-failed" })).toMatchObject({ sent: 0 });
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it("counts an email that went but whose record failed as sent and not recorded, without the person", async () => {
    const users = [contributor(1)];
    const { db, collections } = setup(users);
    vi.spyOn(collections.telemetry_logs, "insertOne").mockRejectedValue(Object.assign(new Error("user1@example.org"), { name: "MongoError" }));
    const result = await run(db, { mode: "apply" });
    expect(result).toMatchObject({ sent: 1, notRecorded: 1 });
    for (const call of console.error.mock.calls) expect(JSON.stringify(call)).not.toContain("@");
  });
});

describe("sendCampaign, auto", () => {
  const AUTO_ENV = { ...ENV, CAMPAIGN_AUTOSEND: "other, welcome-nudge" };

  it("does nothing, and says so, when CAMPAIGN_AUTOSEND does not name the campaign", async () => {
    const { db, collections } = setup([contributor(1)], {
      email_sends: [{ campaign: "welcome-nudge", userId: oid(99).toString(), status: "sent", trigger: "manual" }],
    });
    for (const value of [undefined, "", "other"]) {
      const result = await sendCampaign({ db, transport, sleep, now: () => NOW, env: { ...ENV, CAMPAIGN_AUTOSEND: value }, campaign: "welcome-nudge", mode: "auto" });
      expect(result).toMatchObject({ ok: true, sent: 0 });
      expect(result.message).toContain("CAMPAIGN_AUTOSEND");
    }
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(collections.email_sends.rows).toHaveLength(1);
  });

  it("refuses before any manual send, also when only a failed manual or an auto send exists", async () => {
    const { db } = setup([contributor(1)], {
      email_sends: [
        { campaign: "welcome-nudge", userId: oid(98).toString(), status: "failed", trigger: "manual" },
        { campaign: "welcome-nudge", userId: oid(97).toString(), status: "sent", trigger: "auto" },
      ],
    });
    const result = await sendCampaign({ db, transport, sleep, now: () => NOW, env: AUTO_ENV, campaign: "welcome-nudge", mode: "auto" });
    expect(result).toEqual({ ok: false, error: SEND_BY_HAND_FIRST });
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it("after a manual send, sends to the newly eligible with trigger auto, never to anyone already sent", async () => {
    let now = NOW;
    const { db, collections } = setup([contributor(1), contributor(2, { createdAt: ago(48) })]);
    const go = (mode, env = ENV) => sendCampaign({ db, transport, sleep, env, now: () => now, campaign: "welcome-nudge", mode });

    expect(await go("apply")).toMatchObject({ sent: 1 });
    transport.sendMail.mockClear();
    // The same day: user 2 is 2 days old, so the daily task sends nothing
    expect(await go("auto", AUTO_ENV)).toMatchObject({ ok: true, trigger: "auto", sent: 0 });
    // A day later user 2 has reached 3 days
    now = new Date(NOW.getTime() + 25 * HOUR);
    const result = await go("auto", AUTO_ENV);
    expect(result).toMatchObject({ ok: true, mode: "auto", trigger: "auto", sent: 1 });
    expect(transport.sendMail.mock.calls.map(([m]) => m.to)).toEqual(["user2@example.org"]);
    expect(collections.email_sends.rows.map((r) => [r.userId, r.trigger])).toEqual([
      [oid(1).toString(), "manual"],
      [oid(2).toString(), "auto"],
    ]);
    expect(collections.telemetry_logs.rows.at(-1).trigger).toBe("auto");
    // The next day, nobody new
    transport.sendMail.mockClear();
    now = new Date(NOW.getTime() + 49 * HOUR);
    expect(await go("auto", AUTO_ENV)).toMatchObject({ sent: 0 });
    expect(transport.sendMail).not.toHaveBeenCalled();
  });
});

describe("sendCampaign, refusals", () => {
  it("refuses to run when a setting is missing, saying which", async () => {
    const { db } = setup([contributor(1)]);
    const result = await sendCampaign({ db, transport, env: { ...ENV, EMAIL_PASS: "", NEXTAUTH_SECRET: undefined }, campaign: "welcome-nudge", mode: "dry" });
    expect(result).toEqual({ ok: false, error: "Missing settings: EMAIL_PASS, NEXTAUTH_SECRET." });
  });

  it("refuses an unknown campaign or mode", async () => {
    const { db } = setup([contributor(1)]);
    expect((await run(db, { campaign: "nope", mode: "dry" })).ok).toBe(false);
    expect((await run(db, { mode: "send-everything" })).ok).toBe(false);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });
});

describe("helpers", () => {
  it("shortError never keeps the error's message", () => {
    expect(shortError(Object.assign(new Error("to a@b.c"), { responseCode: 421 }))).toBe("SMTP 421");
    expect(shortError(Object.assign(new Error("a@b.c"), { code: "EAUTH" }))).toBe("EAUTH");
    expect(shortError(new TypeError("a@b.c"))).toBe("TypeError");
    expect(shortError(undefined)).toBe("Error");
  });

  it("autosendCampaigns splits the setting on commas", () => {
    expect(autosendCampaigns(" welcome-nudge , other,,")).toEqual(["welcome-nudge", "other"]);
    expect(autosendCampaigns(undefined)).toEqual([]);
  });
});
