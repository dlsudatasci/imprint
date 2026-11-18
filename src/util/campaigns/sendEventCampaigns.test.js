import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ObjectId } from "mongodb";
import { createFakeDb } from "@/test-utils/fakeMongo";
import { sendCampaign, SEND_BY_HAND_FIRST, BY_HAND_ONLY, ONE_CAMPAIGN_ONLY, PREVIEW_NOT_ALL, ONE_A_DAY_MS, SENT_EVENT } from "./sendCampaign.mjs";
import { trayEntries } from "@/features/navbarMain/navCopy";

/**
 * The sender with the S33 campaigns (17 Nov 2026): several campaigns in one
 * daily run, one email per person per day, previews of each kind, and the
 * exit questionnaire by hand only. An in-memory database and a fake
 * transport: no test sends a real email.
 */
const NOW = new Date("2026-11-20T01:30:00Z");
const HOUR = 60 * 60 * 1000;
const ago = (hours, from = NOW) => new Date(from.getTime() - hours * HOUR);
const oid = (n) => new ObjectId(String(n).padStart(24, "0"));
const id = (n) => oid(n).toString();
const ENV = { NEXTAUTH_URL: "https://imprint.example.org", NEXTAUTH_SECRET: "test-secret", EMAIL_USER: "imprint@example.org", EMAIL_PASS: "x" };
const AUTO = { ...ENV, CAMPAIGN_AUTOSEND: "welcome-nudge,milestone,inactivity" };

const contributor = (n, extra = {}) => ({
  _id: oid(n),
  role: "user",
  username: `user${n}`,
  email: `user${n}@example.org`,
  emailVerifiedAt: ago(900),
  createdAt: ago(800),
  activities: [],
  ...extra,
});
const admin = { _id: oid(900), role: "admin", username: "rans-admin", email: "rans@example.org", emailVerifiedAt: ago(500), createdAt: ago(900) };
const photo = (n, hours, extra = {}) => ({ userId: id(n), imageID: `img-${n}-${hours}`, status: "completed", source: "contributor", date: ago(hours), ...extra });
const crowd = (count) => Array.from({ length: count }, (_, i) => ({ userId: id(5000 + (i % 7)), imageID: `crowd-${i}`, status: "completed", source: "contributor", date: ago(300) }));
/** Rans's manual send of welcome-nudge, long ago, which lets the daily task send it */
const manualNudge = { campaign: "welcome-nudge", userId: id(4000), status: "sent", trigger: "manual", sentAt: ago(2000) };

let transport;
let sleep;
beforeEach(() => {
  transport = { sendMail: vi.fn(async () => ({ messageId: "x" })) };
  sleep = vi.fn(async () => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const setup = (users, seed = {}) => createFakeDb({ users, annotations: [], email_sends: [], telemetry_logs: [], exit_surveys: [], ...seed });
const run = (db, options) => sendCampaign({ db, transport, sleep, env: ENV, now: () => NOW, ...options });
const mailed = () => transport.sendMail.mock.calls.map(([m]) => [m.to, m.subject]);
const feedOf = (collections, n) => collections.users.rows.find((u) => String(u._id) === id(n)).activities;

function expectNoPerson(result, users) {
  const json = JSON.stringify(result);
  for (const u of users) {
    expect(json).not.toContain(u.email);
    expect(json).not.toContain(u.username);
    expect(json).not.toContain(String(u._id));
  }
  expect(json).not.toContain("@");
}

describe("sendCampaign, one of the S33 campaigns by hand", () => {
  it("sends a milestone with its record, the bell message that opens the dashboard, and the event", async () => {
    const users = [contributor(1), contributor(2)];
    const { db, collections } = setup(users, { annotations: [photo(1, 30), ...crowd(999)] });
    const dry = await run(db, { campaign: "milestone-1000", mode: "dry" });
    expect(dry).toEqual({
      ok: true, campaign: "milestone-1000", mode: "dry",
      audience: 1, byVariant: { standard: 1 },
      excluded: { noEmail: 0, pilot: 0, optedOut: 0, noPhoto: 1, alreadySent: 0, failedBefore: 0 },
      wouldSendThisRun: 1, photos: 1000, due: true, limit: 50,
    });
    expect(transport.sendMail).not.toHaveBeenCalled();

    const result = await run(db, { campaign: "milestone-1000", mode: "apply" });
    expect(result).toMatchObject({ ok: true, campaign: "milestone-1000", mode: "apply", trigger: "manual", sent: 1, failed: 0, left: 0, photos: 1000, due: true });
    expectNoPerson(result, users);
    expect(mailed()).toEqual([["user1@example.org", "We've reached 1,000 photos on Imprint!"]]);
    expect(collections.email_sends.rows.map(({ campaign, userId, variant, trigger, status }) => ({ campaign, userId, variant, trigger, status }))).toEqual([
      { campaign: "milestone-1000", userId: id(1), variant: "standard", trigger: "manual", status: "sent" },
    ]);
    expect(feedOf(collections, 1)).toEqual([{
      tag: "message", title: "1,000 photos reached!",
      activity: "Imprint's contributors have finished 1,000 photos. Thank you for being part of it.",
      date: NOW, campaign: "milestone-1000", href: "/contribute",
    }]);
    expect(feedOf(collections, 2)).toEqual([]);
    expect(collections.telemetry_logs.rows.map(({ event, campaign, variant, trigger, userId }) => ({ event, campaign, variant, trigger, userId }))).toEqual([
      { event: SENT_EVENT, campaign: "milestone-1000", variant: "standard", trigger: "manual", userId: id(1) },
    ]);

    transport.sendMail.mockClear();
    expect(await run(db, { campaign: "milestone-1000", mode: "apply" })).toMatchObject({ sent: 0 });
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it("sends the exit questionnaire invitation by hand, to people with and without a photo, each once", async () => {
    const users = [contributor(1), contributor(2, { createdAt: NOW }), contributor(3, { role: "annotator" })];
    const { db, collections } = setup(users, { annotations: [photo(1, 30)] });
    const result = await run(db, { campaign: "exit-questionnaire", mode: "apply" });
    expect(result).toMatchObject({ ok: true, trigger: "manual", sent: 2, left: 0 });
    expect(mailed()).toEqual([
      ["user1@example.org", "One last thing from Imprint"],
      ["user2@example.org", "One last thing from Imprint"],
    ]);
    expect(feedOf(collections, 2)).toEqual([{
      tag: "message", title: "Tell us about your experience", activity: "The optional exit questionnaire takes a few minutes.",
      date: NOW, campaign: "exit-questionnaire", href: "/contribute/exit-survey",
    }]);
    transport.sendMail.mockClear();
    expect(await run(db, { campaign: "exit-questionnaire", mode: "apply" })).toMatchObject({ sent: 0 });
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it("retries a failed inactivity reminder with retry-failed", async () => {
    const { db, collections } = setup([contributor(1)], { annotations: [photo(1, 200)] });
    transport.sendMail.mockRejectedValueOnce(Object.assign(new Error("user1@example.org"), { responseCode: 451 }));
    expect(await run(db, { campaign: "inactivity-1", mode: "apply" })).toMatchObject({ sent: 0, failed: 1 });
    expect(await run(db, { campaign: "inactivity-1", mode: "retry-failed" })).toMatchObject({ ok: true, sent: 1, failed: 0 });
    expect(collections.email_sends.rows).toHaveLength(1);
    expect(collections.email_sends.rows[0]).toMatchObject({ campaign: "inactivity-1", status: "sent" });
  });

  it("is not held back by the one-a-day rule, and takes one campaign id only", async () => {
    const { db } = setup([contributor(1)], {
      annotations: [photo(1, 200)],
      email_sends: [{ campaign: "milestone-1000", userId: id(1), status: "sent", trigger: "auto", sentAt: ago(2) }],
    });
    const result = await run(db, { campaign: "inactivity-1", mode: "apply" });
    expect(result).toMatchObject({ sent: 1 });
    expect(result.sentToday).toBeUndefined();

    for (const mode of ["apply", "retry-failed"]) {
      for (const campaign of ["all", "milestone", "inactivity"]) {
        expect(await run(db, { campaign, mode })).toEqual({ ok: false, error: ONE_CAMPAIGN_ONLY });
      }
    }
  });
});

describe("sendCampaign, auto with one S33 campaign", () => {
  it("needs only its name in CAMPAIGN_AUTOSEND, by id or by family, and no manual send first", async () => {
    const users = [contributor(1)];
    const seed = () => ({ annotations: [photo(1, 200)] });
    for (const value of [undefined, "welcome-nudge", "milestone"]) {
      const { db } = setup(users, seed());
      const result = await run(db, { campaign: "inactivity-1", mode: "auto", env: { ...ENV, CAMPAIGN_AUTOSEND: value } });
      expect(result).toMatchObject({ ok: true, sent: 0 });
      expect(result.message).toContain("CAMPAIGN_AUTOSEND does not name inactivity-1");
    }
    expect(transport.sendMail).not.toHaveBeenCalled();
    for (const value of ["inactivity", "other, inactivity-1"]) {
      const { db, collections } = setup(users, seed());
      expect(await run(db, { campaign: "inactivity-1", mode: "auto", env: { ...ENV, CAMPAIGN_AUTOSEND: value } })).toMatchObject({ ok: true, trigger: "auto", sent: 1, sentToday: 0 });
      expect(collections.email_sends.rows[0]).toMatchObject({ campaign: "inactivity-1", trigger: "auto", status: "sent" });
    }
  });

  it("never sends the exit questionnaire, even when CAMPAIGN_AUTOSEND names it", async () => {
    const { db, collections } = setup([contributor(1)]);
    for (const value of [undefined, "exit-questionnaire", "welcome-nudge,exit-questionnaire"]) {
      expect(await run(db, { campaign: "exit-questionnaire", mode: "auto", env: { ...ENV, CAMPAIGN_AUTOSEND: value } })).toEqual({ ok: false, error: BY_HAND_ONLY });
    }
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(collections.email_sends.rows).toHaveLength(0);
  });

  it("leaves out someone sent any campaign in the last 20 hours, counts them as sentToday, and sends them on a run a day later", async () => {
    let now = NOW;
    const users = [contributor(1), contributor(2)];
    const { db } = setup(users, {
      annotations: [photo(1, 30), photo(2, 30), ...crowd(998)],
      // User 1 was sent another campaign 19 hours ago, user 2 one 23 hours 59 minutes ago
      email_sends: [
        { campaign: "exit-questionnaire", userId: id(1), status: "sent", trigger: "manual", sentAt: ago(19) },
        { campaign: "exit-questionnaire", userId: id(2), status: "sent", trigger: "manual", sentAt: ago(23 + 59 / 60) },
      ],
    });
    const go = () => sendCampaign({ db, transport, sleep, env: AUTO, now: () => now, campaign: "milestone-1000", mode: "auto" });

    const first = await go();
    expect(first).toMatchObject({ ok: true, trigger: "auto", sent: 1, sentToday: 1, left: 0 });
    expectNoPerson(first, users);
    expect(mailed().map(([to]) => to)).toEqual(["user2@example.org"]);

    // A day later nothing is queued: the run works out afresh who qualifies
    transport.sendMail.mockClear();
    now = new Date(NOW.getTime() + 24 * HOUR);
    expect(await go()).toMatchObject({ sent: 1, sentToday: 0 });
    expect(mailed().map(([to]) => to)).toEqual(["user1@example.org"]);
    expect(ONE_A_DAY_MS).toBe(20 * HOUR);
  });

  it("does not count a failed send, or one over 20 hours old, as sent today", async () => {
    const { db } = setup([contributor(1), contributor(2)], {
      annotations: [photo(1, 200), photo(2, 200)],
      email_sends: [
        { campaign: "milestone-1000", userId: id(1), status: "failed", trigger: "auto", failedAt: ago(1) },
        { campaign: "milestone-1000", userId: id(2), status: "sent", trigger: "auto", sentAt: ago(20.01) },
      ],
    });
    expect(await run(db, { campaign: "inactivity-1", mode: "auto", env: AUTO })).toMatchObject({ sent: 2, sentToday: 0 });
  });

  it("counts a manual apply for the next automatic run", async () => {
    const { db } = setup([contributor(1)], { annotations: [photo(1, 200), ...crowd(999)] });
    expect(await run(db, { campaign: "milestone-1000", mode: "apply" })).toMatchObject({ sent: 1 });
    transport.sendMail.mockClear();
    expect(await run(db, { campaign: "inactivity-1", mode: "auto", env: AUTO })).toMatchObject({ sent: 0, sentToday: 1 });
    expect(transport.sendMail).not.toHaveBeenCalled();
  });
});

describe('sendCampaign, campaign "all"', () => {
  // 1: no photo, 4 days old (welcome-nudge). 2 and 3: a photo, quiet for 5 days
  // (the milestone and the reminder). 4: active (the milestone only).
  const users = () => [contributor(1, { createdAt: ago(96) }), contributor(2), contributor(3), contributor(4)];
  const seed = (extra = {}) => ({
    annotations: [photo(2, 200), photo(3, 200), photo(4, 10), ...crowd(997)],
    email_sends: [manualNudge],
    ...extra,
  });

  it("runs what CAMPAIGN_AUTOSEND names, in the stated order, and sends nobody two emails", async () => {
    const all = users();
    const { db, collections } = setup(all, seed());
    const result = await run(db, { campaign: "all", mode: "auto", env: AUTO, pauseMs: 5 });
    expect(result).toMatchObject({ ok: true, campaign: "all", mode: "auto", trigger: "auto", sent: 4, failed: 0, skipped: 0, notRecorded: 0, limit: 50 });
    expectNoPerson(result, all);
    expect(result.campaigns.map((c) => c.campaign)).toEqual([
      "welcome-nudge", "milestone-1000", "milestone-1500", "milestone-2000", "milestone-2500", "inactivity-1", "inactivity-2", "inactivity-3",
    ]);
    expect(result.campaigns.map((c) => c.sent)).toEqual([1, 3, 0, 0, 0, 0, 0, 0]);
    // The quiet two had the milestone in this run, so the reminder waits
    expect(result.campaigns.find((c) => c.campaign === "inactivity-1")).toMatchObject({ sent: 0, sentToday: 2, left: 0 });
    expect(result.campaigns.find((c) => c.campaign === "milestone-1500")).toMatchObject({ photos: 1000, due: false });
    expect(mailed()).toEqual([
      ["user1@example.org", "Your first sidewalk is waiting on Imprint"],
      ["user2@example.org", "We've reached 1,000 photos on Imprint!"],
      ["user3@example.org", "We've reached 1,000 photos on Imprint!"],
      ["user4@example.org", "We've reached 1,000 photos on Imprint!"],
    ]);
    // A pause between every two sends of the run, across campaigns too
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(collections.email_sends.rows.filter((r) => r.trigger === "auto").map((r) => r.campaign)).toEqual(["welcome-nudge", "milestone-1000", "milestone-1000", "milestone-1000"]);
    expect(collections.telemetry_logs.rows.every((r) => r.trigger === "auto")).toBe(true);

    // 19 hours later they are still held
    transport.sendMail.mockClear();
    const held = await sendCampaign({ db, transport, sleep, env: AUTO, now: () => new Date(NOW.getTime() + 19 * HOUR), campaign: "all", mode: "auto" });
    expect(held.sent).toBe(0);
    expect(held.campaigns.find((c) => c.campaign === "inactivity-1")).toMatchObject({ sentToday: 2 });
    expect(transport.sendMail).not.toHaveBeenCalled();

    // The next day's run at the same time, 23 hours 59 minutes after
    // yesterday's sends, which went a moment after yesterday's run began: the
    // reminder goes to the two who are still quiet, and nothing else
    const next = await sendCampaign({ db, transport, sleep, env: AUTO, now: () => new Date(NOW.getTime() + 24 * HOUR - 60000), campaign: "all", mode: "auto" });
    expect(next.sent).toBe(2);
    expect(next.campaigns.find((c) => c.campaign === "inactivity-1")).toMatchObject({ sent: 2, sentToday: 0 });
    expect(mailed()).toEqual([
      ["user2@example.org", "Your sidewalks are waiting on Imprint"],
      ["user3@example.org", "Your sidewalks are waiting on Imprint"],
    ]);
  });

  it("runs only what the setting names, a family name covering its rounds", async () => {
    const { db } = setup(users(), seed());
    const onlyReminders = await run(db, { campaign: "all", mode: "auto", env: { ...ENV, CAMPAIGN_AUTOSEND: "inactivity" } });
    expect(onlyReminders.campaigns.map((c) => c.campaign)).toEqual(["inactivity-1", "inactivity-2", "inactivity-3"]);
    expect(onlyReminders.sent).toBe(2);
    expect(mailed().map(([, subject]) => subject)).toEqual(["Your sidewalks are waiting on Imprint", "Your sidewalks are waiting on Imprint"]);

    const { db: other } = setup(users(), seed());
    const oneRound = await run(other, { campaign: "all", mode: "auto", env: { ...ENV, CAMPAIGN_AUTOSEND: "milestone-1000, inactivity-2" } });
    expect(oneRound.campaigns.map((c) => c.campaign)).toEqual(["milestone-1000", "inactivity-2"]);
  });

  it("sends nothing, and says so, when the setting names nothing", async () => {
    const { db, collections } = setup(users(), seed());
    for (const value of [undefined, "", "something-else"]) {
      const result = await run(db, { campaign: "all", mode: "auto", env: { ...ENV, CAMPAIGN_AUTOSEND: value } });
      expect(result).toMatchObject({ ok: true, sent: 0, campaigns: [] });
      expect(result.message).toContain("CAMPAIGN_AUTOSEND");
    }
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(collections.email_sends.rows).toHaveLength(1);
  });

  it("shares one limit across the run", async () => {
    const { db } = setup(users(), seed());
    const result = await run(db, { campaign: "all", mode: "auto", env: AUTO, limit: 2 });
    expect(result).toMatchObject({ sent: 2, limit: 2 });
    expect(result.campaigns.map((c) => [c.campaign, c.sent, c.left]).slice(0, 2)).toEqual([["welcome-nudge", 1, 0], ["milestone-1000", 1, 2]]);
    expect(result.campaigns.find((c) => c.campaign === "inactivity-1")).toMatchObject({ sent: 0, left: 1 });
    expect(transport.sendMail).toHaveBeenCalledTimes(2);
  });

  it("still refuses welcome-nudge before a manual send, and goes on with the rest", async () => {
    const { db } = setup(users(), seed({ email_sends: [] }));
    const result = await run(db, { campaign: "all", mode: "auto", env: AUTO });
    expect(result.campaigns[0]).toEqual({ campaign: "welcome-nudge", ok: false, error: SEND_BY_HAND_FIRST });
    expect(result).toMatchObject({ ok: true, sent: 3 });
    expect(mailed().map(([to]) => to)).toEqual(["user2@example.org", "user3@example.org", "user4@example.org"]);
  });

  it("refuses the exit questionnaire even when the setting names it", async () => {
    const { db, collections } = setup(users(), seed());
    const result = await run(db, { campaign: "all", mode: "auto", env: { ...ENV, CAMPAIGN_AUTOSEND: "exit-questionnaire,inactivity" } });
    expect(result.campaigns[0]).toEqual({ campaign: "exit-questionnaire", ok: false, error: BY_HAND_ONLY });
    expect(result.campaigns.map((c) => c.campaign)).toEqual(["exit-questionnaire", "inactivity-1", "inactivity-2", "inactivity-3"]);
    expect(mailed().every(([, subject]) => subject === "Your sidewalks are waiting on Imprint")).toBe(true);
    expect(collections.email_sends.rows.some((r) => r.campaign === "exit-questionnaire")).toBe(false);
  });

  it("with dry lists each campaign's counts as the daily run would go, and sends and writes nothing", async () => {
    const all = users();
    const { db, collections } = setup(all, seed());
    const result = await run(db, { campaign: "all", mode: "dry", env: AUTO });
    expect(result).toMatchObject({ ok: true, campaign: "all", mode: "dry", limit: 50, wouldSendThisRun: 4 });
    expectNoPerson(result, all);
    expect(result.campaigns.map((c) => [c.campaign, c.audience, c.wouldSendThisRun, c.sentToday])).toEqual([
      ["welcome-nudge", 1, 1, 0],
      ["milestone-1000", 3, 3, 0],
      ["milestone-1500", 0, 0, 0],
      ["milestone-2000", 0, 0, 0],
      ["milestone-2500", 0, 0, 0],
      ["inactivity-1", 0, 0, 2],
      ["inactivity-2", 0, 0, 0],
      ["inactivity-3", 0, 0, 0],
    ]);
    expect(result.campaigns[1]).toMatchObject({ photos: 1000, due: true, excluded: { noPhoto: 1 } });
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(collections.email_sends.rows).toHaveLength(1);
    expect(collections.telemetry_logs.rows).toHaveLength(0);
    expect(collections.users.rows.every((u) => u.activities.length === 0)).toBe(true);
  });

  it("with dry accepts a family name, without asking the setting", async () => {
    const { db } = setup(users(), seed());
    const result = await run(db, { campaign: "inactivity", mode: "dry" });
    expect(result.campaigns.map((c) => [c.campaign, c.audience])).toEqual([["inactivity-1", 2], ["inactivity-2", 0], ["inactivity-3", 0]]);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it("with auto and a family name runs that family's rounds, when the setting names them", async () => {
    const { db } = setup(users(), seed());
    const result = await run(db, { campaign: "milestone", mode: "auto", env: AUTO });
    expect(result).toMatchObject({ ok: true, campaign: "milestone", sent: 3 });
    expect(result.campaigns.map((c) => c.campaign)).toEqual(["milestone-1000", "milestone-1500", "milestone-2000", "milestone-2500"]);
    const { db: unnamed } = setup(users(), seed());
    const none = await run(unnamed, { campaign: "milestone", mode: "auto", env: { ...ENV, CAMPAIGN_AUTOSEND: "inactivity" } });
    expect(none.sent).toBe(0);
    expect(none.campaigns.every((c) => c.message.includes("CAMPAIGN_AUTOSEND does not name"))).toBe(true);
  });
});

describe("sendCampaign, previews of the S33 kinds", () => {
  const titles = (collections) => collections.users.rows.find((u) => u.role === "admin").activities.map((a) => a.title);

  it("previews the milestones as two emails, the 1,000 one and the last, whatever the photo count", async () => {
    const { db, collections } = setup([contributor(1), admin]);
    const result = await run(db, { campaign: "milestone", mode: "preview", previewTo: "rans-admin" });
    expect(result).toEqual({ ok: true, campaign: "milestone", mode: "preview", previewSent: 2, previewBell: 2 });
    const mails = transport.sendMail.mock.calls.map(([m]) => m);
    expect(mails.map((m) => [m.to, m.subject])).toEqual([
      ["rans@example.org", "[Preview] We've reached 1,000 photos on Imprint!"],
      ["rans@example.org", "[Preview] We've reached 2,500 photos on Imprint!"],
    ]);
    expect(mails[0].text).toContain("Our next goal is 1,500 photos.");
    expect(mails[1].text).not.toContain("next goal");
    expect(titles(collections)).toEqual(["[Preview] 1,000 photos reached!", "[Preview] 2,500 photos reached!"]);
    expect(collections.email_sends.rows).toHaveLength(0);
    expect(collections.telemetry_logs.rows).toHaveLength(0);
    expect(collections.users.rows.find((u) => u.role !== "admin").activities).toEqual([]);
  });

  it("previews a single milestone by its id", async () => {
    const { db } = setup([admin]);
    expect(await run(db, { campaign: "milestone-1500", mode: "preview", previewTo: "rans-admin" })).toMatchObject({ previewSent: 1, previewBell: 1 });
    expect(mailed()).toEqual([["rans@example.org", "[Preview] We've reached 1,500 photos on Imprint!"]]);
  });

  it("previews the inactivity reminder as one email", async () => {
    const { db, collections } = setup([admin]);
    expect(await run(db, { campaign: "inactivity", mode: "preview", previewTo: "rans-admin" })).toEqual({ ok: true, campaign: "inactivity", mode: "preview", previewSent: 1, previewBell: 1 });
    expect(mailed()).toEqual([["rans@example.org", "[Preview] Your sidewalks are waiting on Imprint"]]);
    expect(titles(collections)).toEqual(["[Preview] Ready for another session?"]);
  });

  it("previews the exit questionnaire as one email whose bell message links to the questionnaire, with no send record", async () => {
    const { db, collections } = setup([admin]);
    expect(await run(db, { campaign: "exit-questionnaire", mode: "preview", previewTo: "rans-admin" })).toMatchObject({ previewSent: 1, previewBell: 1 });
    expect(mailed()).toEqual([["rans@example.org", "[Preview] One last thing from Imprint"]]);
    const feed = collections.users.rows[0].activities;
    expect(feed).toEqual([{
      tag: "message", title: "[Preview] Tell us about your experience", activity: "The optional exit questionnaire takes a few minutes.",
      date: NOW, campaign: "exit-questionnaire", href: "/contribute/exit-survey",
    }]);
    expect(trayEntries(feed, null).unread[0].href).toBe("/contribute/exit-survey");
    // No send, so the dashboard's button never comes from a preview
    expect(collections.email_sends.rows).toHaveLength(0);
    expect(collections.telemetry_logs.rows).toHaveLength(0);
  });

  it("refuses a non-admin for every kind, and a preview of all", async () => {
    const { db, collections } = setup([contributor(1), admin]);
    for (const campaign of ["milestone", "inactivity", "exit-questionnaire", "milestone-2000"]) {
      expect((await run(db, { campaign, mode: "preview", previewTo: "user1" })).ok).toBe(false);
    }
    expect(await run(db, { campaign: "all", mode: "preview", previewTo: "rans-admin" })).toEqual({ ok: false, error: PREVIEW_NOT_ALL });
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(collections.users.rows.find((u) => u.username === "user1").activities).toEqual([]);
  });
});
