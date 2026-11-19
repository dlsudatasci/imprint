import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ObjectId } from "mongodb";
import { createFakeDb } from "@/test-utils/fakeMongo";
import {
  findCampaign,
  leaderboardAnnouncement,
  LEADERBOARD_ANNOUNCEMENT_ID,
  AUTO_ORDER,
  FAMILIES,
  BUTTON_WIDTH,
  BUTTON_HEIGHT,
} from "./campaigns.mjs";
import { sendCampaign, buildCampaignMail, BY_HAND_ONLY, ONE_A_DAY_MS } from "./sendCampaign.mjs";
import { checkUnsubscribe } from "@/util/emailLinks.mjs";
import { trayEntries } from "@/features/navbarMain/navCopy";
import { loginPathFor, afterLoginPath, RETURN_PATHS } from "@/util/loginReturn.mjs";

/**
 * The leaderboard announcement (18 Nov 2026): a one-time email by hand, to
 * contributors with a finished photo, never on the same day as an automatic
 * email, with two buttons. An in-memory database and a fake transport: no
 * test sends a real email.
 */
const NOW = new Date("2026-11-19T01:30:00Z");
const HOUR = 60 * 60 * 1000;
const ago = (hours) => new Date(NOW.getTime() - hours * HOUR);
const oid = (n) => new ObjectId(String(n).padStart(24, "0"));
const id = (n) => oid(n).toString();
const ORIGIN = "https://imprint.example.org";
const ENV = { NEXTAUTH_URL: `${ORIGIN}/`, NEXTAUTH_SECRET: "test-secret", EMAIL_USER: "imprint@example.org", EMAIL_PASS: "x" };

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
const photo = (n, extra = {}) => ({ userId: id(n), imageID: `img-${n}`, status: "completed", source: "contributor", date: ago(100), ...extra });
const sentBefore = (n, hours, campaign = "milestone-1000") => ({ campaign, userId: id(n), status: "sent", trigger: "auto", sentAt: ago(hours) });

let transport;
beforeEach(() => {
  transport = { sendMail: vi.fn(async () => ({ messageId: "x" })) };
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const setup = (users, seed = {}) => createFakeDb({ users, annotations: [], email_sends: [], telemetry_logs: [], ...seed });
const run = (db, options) => sendCampaign({ db, transport, sleep: async () => {}, env: ENV, now: () => NOW, campaign: LEADERBOARD_ANNOUNCEMENT_ID, ...options });
const mailedTo = () => transport.sendMail.mock.calls.map(([m]) => m.to);
const audience = async (db) => (await leaderboardAnnouncement.audience(db, NOW)).map(String).sort();

describe("leaderboard-announcement, the campaign", () => {
  it("is found by its id, sent by hand only, and in no daily run or family", () => {
    expect(LEADERBOARD_ANNOUNCEMENT_ID).toBe("leaderboard-announcement");
    expect(findCampaign("leaderboard-announcement")).toBe(leaderboardAnnouncement);
    expect(leaderboardAnnouncement.manualOnly).toBe(true);
    // The same-day hold was turned off after the first send (19 Nov 2026, Rans)
    expect(leaderboardAnnouncement.holdSameDay).toBe(false);
    expect(AUTO_ORDER).not.toContain(leaderboardAnnouncement);
    for (const family of Object.values(FAMILIES)) expect(family.members).not.toContain(leaderboardAnnouncement);
  });
});

describe("leaderboard-announcement, the audience", () => {
  const people = () => [
    contributor(1), // a photo: in
    contributor(2), // no photo
    contributor(3, { isPilot: true }),
    contributor(4, { role: "annotator" }),
    contributor(5, { role: "admin" }),
    contributor(6, { emailOptOutAt: ago(1) }),
    contributor(7, { role: undefined }), // no role is a contributor: in
    contributor(8), // already sent
    contributor(9), // only a pending photo
    contributor(10), // only an annotator-source photo
    contributor(11), // its photo's userId stored as an ObjectId: in
  ];
  const photos = () => [
    photo(1), photo(3), photo(4, { source: "annotator" }), photo(5), photo(6), photo(7), photo(8),
    photo(9, { status: "pending" }), photo(10, { source: "annotator" }), photo(11, { userId: oid(11) }),
  ];

  it("is contributors with a finished photo of their own, leaving out those without one, pilots, annotators, admins, opted-out accounts and those already sent", async () => {
    const { db } = setup(people(), {
      annotations: photos(),
      email_sends: [{ campaign: LEADERBOARD_ANNOUNCEMENT_ID, userId: id(8), status: "sent", trigger: "manual", sentAt: ago(300) }],
    });
    expect(await audience(db)).toEqual([id(1), id(11), id(7)].sort());
    const sorted = await leaderboardAnnouncement.sort(db, NOW);
    // Annotators and admins are never counted, the rest under one reason each
    expect(sorted.excluded).toEqual({ noEmail: 0, pilot: 1, optedOut: 1, noPhoto: 3, alreadySent: 1, failedBefore: 0 });
  });

  it("puts a failed send under failedBefore for retry-failed, only while the person still has a photo", async () => {
    const { db } = setup([contributor(1), contributor(2)], {
      annotations: [photo(1)],
      email_sends: [
        { campaign: LEADERBOARD_ANNOUNCEMENT_ID, userId: id(1), status: "failed", trigger: "manual" },
        { campaign: LEADERBOARD_ANNOUNCEMENT_ID, userId: id(2), status: "failed", trigger: "manual" },
      ],
    });
    const sorted = await leaderboardAnnouncement.sort(db, NOW);
    expect(sorted.failed.map((u) => String(u._id))).toEqual([id(1)]);
    expect(sorted.excluded).toMatchObject({ failedBefore: 1, noPhoto: 1 });
  });
});

describe("leaderboard-announcement, sending", () => {
  it("is refused by auto, whatever CAMPAIGN_AUTOSEND says, and sends nothing", async () => {
    const { db, collections } = setup([contributor(1)], { annotations: [photo(1)] });
    for (const value of [undefined, "leaderboard-announcement", "welcome-nudge,leaderboard-announcement"]) {
      expect(await run(db, { mode: "auto", env: { ...ENV, CAMPAIGN_AUTOSEND: value } })).toEqual({ ok: false, error: BY_HAND_ONLY });
    }
    // Named in a daily run, it is refused there too
    const all = await run(db, { campaign: "all", mode: "auto", env: { ...ENV, CAMPAIGN_AUTOSEND: "leaderboard-announcement" } });
    expect(all.campaigns).toEqual([{ campaign: LEADERBOARD_ANNOUNCEMENT_ID, ok: false, error: BY_HAND_ONLY }]);
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(collections.email_sends.rows).toHaveLength(0);
  });

  it("in apply sends to someone emailed 19 hours earlier too, the hold being off (19 Nov 2026)", async () => {
    expect(ONE_A_DAY_MS).toBe(20 * HOUR);
    const users = [contributor(1), contributor(2), contributor(3)];
    const { db, collections } = setup(users, {
      annotations: [photo(1), photo(2), photo(3)],
      email_sends: [sentBefore(1, 19), sentBefore(2, 21, "inactivity-1")],
    });
    const result = await run(db, { mode: "apply" });
    expect(result).toMatchObject({ ok: true, trigger: "manual", sent: 3, left: 0 });
    expect(result.sentToday).toBeUndefined();
    expect(mailedTo().sort()).toEqual(["user1@example.org", "user2@example.org", "user3@example.org"]);
    expect(collections.email_sends.rows.filter((r) => r.campaign === LEADERBOARD_ANNOUNCEMENT_ID).map((r) => r.userId).sort()).toEqual([id(1), id(2), id(3)]);
    // No address, username or id in the answer
    expect(JSON.stringify(result)).not.toMatch(/@|user\d|0{20}/);
  });

  it("sends each person once: a second apply sends nothing", async () => {
    const { db } = setup([contributor(1)], { annotations: [photo(1)], email_sends: [sentBefore(1, 19)] });
    expect(await run(db, { mode: "apply" })).toMatchObject({ sent: 1 });
    expect(await run(db, { mode: "apply" })).toMatchObject({ sent: 0 });
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });

  it("in retry-failed resends a failed send, even to someone emailed in the last 20 hours", async () => {
    const { db } = setup([contributor(1), contributor(2)], {
      annotations: [photo(1), photo(2)],
      email_sends: [
        { campaign: LEADERBOARD_ANNOUNCEMENT_ID, userId: id(1), status: "failed", trigger: "manual" },
        sentBefore(1, 5, "inactivity-2"),
      ],
    });
    expect(await run(db, { mode: "retry-failed" })).toMatchObject({ sent: 1 });
    expect(mailedTo()).toEqual(["user1@example.org"]);
  });

  it("in dry counts everyone, with no sentToday, and sends and writes nothing", async () => {
    const { db, collections } = setup([contributor(1), contributor(2), contributor(3)], {
      annotations: [photo(1), photo(2), photo(3)],
      email_sends: [sentBefore(1, 19), sentBefore(2, 21)],
    });
    const result = await run(db, { mode: "dry" });
    expect(result).toEqual({
      ok: true, campaign: LEADERBOARD_ANNOUNCEMENT_ID, mode: "dry",
      audience: 3, byVariant: { standard: 3 },
      excluded: { noEmail: 0, pilot: 0, optedOut: 0, noPhoto: 0, alreadySent: 0, failedBefore: 0 },
      wouldSendThisRun: 3, limit: 50,
    });
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(collections.email_sends.rows).toHaveLength(2);
    expect(collections.telemetry_logs.rows).toHaveLength(0);
  });

  it("writes the bell message, linked to the leaderboard, and the event", async () => {
    const { db, collections } = setup([contributor(1)], { annotations: [photo(1)] });
    await run(db, { mode: "apply" });
    const feed = collections.users.rows[0].activities;
    expect(feed).toEqual([{
      tag: "message", title: "New: the leaderboard", activity: "See where you stand among Imprint's contributors.",
      date: NOW, campaign: LEADERBOARD_ANNOUNCEMENT_ID, href: "/contribute/leaderboard",
    }]);
    expect(trayEntries(feed, null).unread[0]).toMatchObject({ title: "New: the leaderboard", href: "/contribute/leaderboard" });
    expect(collections.telemetry_logs.rows).toEqual([expect.objectContaining({ event: "CAMPAIGN_EMAIL_SENT", campaign: LEADERBOARD_ANNOUNCEMENT_ID, trigger: "manual" })]);
  });

  it("previews to an admin only, with [Preview] subject and bell title, recording nothing", async () => {
    const { db, collections } = setup([contributor(1), admin], { annotations: [] });
    expect((await run(db, { mode: "preview", previewTo: "user1" })).ok).toBe(false);
    const result = await run(db, { mode: "preview", previewTo: "rans-admin" });
    expect(result).toEqual({ ok: true, campaign: LEADERBOARD_ANNOUNCEMENT_ID, mode: "preview", previewSent: 1, previewBell: 1 });
    expect(transport.sendMail.mock.calls.map(([m]) => [m.to, m.subject])).toEqual([["rans@example.org", "[Preview] See where you stand on the Imprint leaderboard"]]);
    const feed = collections.users.rows.find((u) => u.role === "admin").activities;
    expect(feed).toEqual([expect.objectContaining({ title: "[Preview] New: the leaderboard", href: "/contribute/leaderboard" })]);
    expect(collections.users.rows.find((u) => u.role !== "admin").activities).toEqual([]);
    expect(collections.email_sends.rows).toHaveLength(0);
    expect(collections.telemetry_logs.rows).toHaveLength(0);
  });
});

// The words, exactly as given on 18 Nov 2026
const TEXT = (stop) => `Hey Rans!

We've added a leaderboard to Imprint. It ranks contributors by the photos they've finished, and every photo you finish counts toward your place.

You choose whether your username is shown. If you'd rather not, you appear as a number instead, and you can change this anytime.

Ready to move up the leaderboard?

See the leaderboard: ${ORIGIN}/contribute/leaderboard

Start annotating: ${ORIGIN}/contribute

Thank you for joining us in knowing our streets better.

Francis Bawa, Imprint
BSMS Computer Science, DLSU

You're getting this because you signed up for Imprint. Don't want emails like this? Stop these emails: ${stop}`;

const rans = contributor(1, { username: "Rans", email: "rans@example.org" });
const build = (user = rans) => buildCampaignMail(leaderboardAnnouncement, user, "standard", ENV);
const stopUrl = (mail) => /Stop these emails: (\S+)$/.exec(mail.text)[1];
const htmlText = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

describe("leaderboard-announcement, the words and the look", () => {
  const { mail, bell } = build();
  const at = (s) => mail.html.indexOf(s);

  it("are the subject, text and bell exactly, the text listing both links", () => {
    expect(mail.subject).toBe("See where you stand on the Imprint leaderboard");
    expect(mail.text).toBe(TEXT(stopUrl(mail)));
    expect(bell).toEqual({ title: "New: the leaderboard", activity: "See where you stand among Imprint's contributors.", href: "/contribute/leaderboard" });
    expect(mail.to).toBe("rans@example.org");
  });

  it("say the same words in the html, in the same order", () => {
    const words = htmlText(mail.html);
    let from = 0;
    for (const line of mail.text.split("\n").filter(Boolean)) {
      const plain = line.replace(/: https?:\/\/\S+$/, "");
      const found = words.indexOf(plain, from);
      expect(found, plain).toBeGreaterThanOrEqual(from);
      from = found;
    }
  });

  it("has the main button to the leaderboard, its link under it, then the second button to annotating, its link under it, then the sign-off", () => {
    const main = `<a href="${ORIGIN}/contribute/leaderboard" style="display:block;`;
    const mainLink = `>${ORIGIN}/contribute/leaderboard</a></p>`;
    const second = `<a href="${ORIGIN}/contribute" style="display:block;`;
    const secondLink = `>${ORIGIN}/contribute</a></p>`;
    for (const s of [main, mainLink, second, secondLink]) expect(mail.html.split(s), s).toHaveLength(2);
    expect(at("Ready to move up the leaderboard?")).toBeLessThan(at(main));
    expect(at(main)).toBeLessThan(at(">See the leaderboard</a>"));
    expect(at(">See the leaderboard</a>")).toBeLessThan(at(mainLink));
    expect(at(mainLink)).toBeLessThan(at(second));
    expect(at(second)).toBeLessThan(at(">Start annotating</a>"));
    expect(at(">Start annotating</a>")).toBeLessThan(at(secondLink));
    expect(at(secondLink)).toBeLessThan(at("Thank you for joining us"));
  });

  it("builds both buttons as one-cell tables of the same size, primary white on blue and secondary blue on white with a blue border", () => {
    const cells = [...mail.html.matchAll(/<td align="center" valign="middle" width="(\d+)" height="(\d+)" bgcolor="(#[0-9a-f]{6})" style="([^"]+)"><a href="[^"]+" style="([^"]+)">([^<]+)<\/a><\/td>/g)];
    expect(cells.map((m) => m[6])).toEqual(["See the leaderboard", "Start annotating"]);
    const [primary, secondary] = cells;
    for (const m of cells) {
      expect([m[1], m[2]]).toEqual([String(BUTTON_WIDTH), String(BUTTON_HEIGHT)]);
      expect(m[4]).toContain(`width:${BUTTON_WIDTH}px;height:${BUTTON_HEIGHT}px;`);
      expect(m[4]).toContain("border:2px solid #004aad");
      expect(m[5]).toContain(`width:${BUTTON_WIDTH - 4}px;line-height:${BUTTON_HEIGHT - 4}px;mso-line-height-rule:exactly`);
      expect(m[5]).toContain("display:block");
      expect(m[5]).toContain("font-size:16px;font-weight:bold");
    }
    expect(primary[3]).toBe("#004aad");
    expect(primary[4]).toContain("background-color:#004aad");
    expect(primary[5]).toContain("color:#ffffff");
    expect(secondary[3]).toBe("#ffffff");
    expect(secondary[4]).toContain("background-color:#ffffff");
    expect(secondary[5]).toContain("color:#004aad");
    // Each table is centered for Outlook and the rest
    expect(mail.html.match(/<table role="presentation" align="center"[^>]*border-collapse:separate/g)).toHaveLength(2);
  });

  it("has the welcome-nudge look: the logo header, black text, the sign-off and the stop line, with no animation", () => {
    expect(mail.html).toContain('<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto 24px">');
    expect(at(`<img src="${ORIGIN}/images/email/logo.png" width="28" height="40" alt="Imprint"`)).toBeGreaterThan(-1);
    expect(at(">Imprint</a>")).toBeLessThan(at("Hey Rans!"));
    expect(mail.html).not.toContain("how-it-works.gif");
    expect(mail.text).not.toContain("how-it-works.gif");
    const colours = [...mail.html.matchAll(/(?<![-\w])color:(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());
    expect(new Set(colours)).toEqual(new Set(["#000000", "#ffffff", "#004aad"]));
    expect(mail.html).toContain("Thank you for joining us in knowing our streets better.<br><br>Francis Bawa, Imprint<br>BSMS Computer Science, DLSU</p>");
    expect(mail.html).toMatch(/<p style="color:#000000;font-size:12px;line-height:1\.5;margin:0">You&#39;re getting this/);
    expect(mail.html).not.toMatch(/https:\/\/imprint\.example\.org\/\//);
  });

  it("has a working stop link and the one-click headers", () => {
    const page = new URL(stopUrl(mail));
    expect(page.pathname).toBe("/unsubscribe");
    expect(checkUnsubscribe(page.searchParams.get("u"), page.searchParams.get("t"), ENV.NEXTAUTH_SECRET)).toBe(true);
    expect(mail.html).toContain(">Stop these emails</a>");
    expect(new URL(/^<(.+)>$/.exec(mail.headers["List-Unsubscribe"])[1]).pathname).toBe("/api/email/unsubscribe");
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("has no em dash and no semicolon in the subject, text, html words or bell, and escapes the username", () => {
    for (const s of [mail.subject, mail.text, htmlText(mail.html), bell.title, bell.activity]) {
      expect(s).not.toMatch(/—/);
      expect(s).not.toContain(";");
    }
    const sly = build(contributor(1, { username: "<b>&\"x'" })).mail;
    expect(sly.html).toContain("Hey &lt;b&gt;&amp;&quot;x&#39;!");
    expect(sly.html).not.toContain("<b>&");
  });

  it("leaves the other campaigns' single button as it was", () => {
    const exit = buildCampaignMail(findCampaign("exit-questionnaire"), rans, "standard", ENV).mail;
    expect(exit.html).not.toContain("border-collapse:separate");
    expect(exit.html).toMatch(/<a href="https:\/\/imprint\.example\.org\/contribute\/exit-survey" style="background-color:#004aad;color:#ffffff;padding:12px 24px;/);
    expect(exit.text).not.toContain("Start annotating");
  });
});

describe("leaderboard-announcement, signing in from its link", () => {
  it("sends a signed-out visitor to the leaderboard to log in with next, and back to the leaderboard afterwards", () => {
    expect(RETURN_PATHS).toContain("/contribute/leaderboard");
    expect(loginPathFor("/contribute/leaderboard")).toBe("/login?next=%2Fcontribute%2Fleaderboard");
    expect(afterLoginPath("/contribute/leaderboard")).toBe("/contribute/leaderboard");
    expect(afterLoginPath("/contribute/leaderboard/../../admin")).toBe("/contribute");
  });
});
