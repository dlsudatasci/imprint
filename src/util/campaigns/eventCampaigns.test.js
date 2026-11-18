import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { createFakeDb } from "@/test-utils/fakeMongo";
import {
  findCampaign,
  findFamily,
  CAMPAIGNS,
  FAMILIES,
  AUTO_ORDER,
  MILESTONES,
  INACTIVE_AFTER_MS,
  INACTIVITY_ROUNDS,
  milestoneDue,
  exitQuestionnaire,
  welcomeNudge,
} from "./campaigns.mjs";
import { buildCampaignMail } from "./sendCampaign.mjs";
import { FIRST_SESSION } from "@/features/annotate/firstSession.mjs";
import { checkUnsubscribe } from "@/util/emailLinks.mjs";
import { publicPhotoCount, publicPhotoFilter } from "@/util/publicPhotoCount.mjs";

/**
 * The S33 campaigns (17 Nov 2026): who the community milestones, the
 * inactivity reminder and the exit questionnaire invitation go to, and their
 * words exactly as Rans read them. An in-memory database, no email sent.
 */
const NOW = new Date("2026-11-20T01:30:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (hours) => new Date(NOW.getTime() - hours * HOUR);
const oid = (n) => new ObjectId(String(n).padStart(24, "0"));
const id = (n) => oid(n).toString();
const ENV = { NEXTAUTH_URL: "https://imprint.example.org/", NEXTAUTH_SECRET: "test-secret", EMAIL_USER: "imprint@example.org", EMAIL_PASS: "x" };
const ORIGIN = "https://imprint.example.org";

const contributor = (n, extra = {}) => ({
  _id: oid(n),
  role: "user",
  username: `user${n}`,
  email: `user${n}@example.org`,
  emailVerifiedAt: ago(900),
  createdAt: ago(800),
  ...extra,
});

/** A finished photo of contributor `n`, `hours` ago */
const photo = (n, hours, extra = {}) => ({ userId: id(n), imageID: `img-${n}-${hours}`, status: "completed", source: "contributor", date: ago(hours), ...extra });
/** `count` finished photos by people who are not in the test's users */
const crowd = (count) => Array.from({ length: count }, (_, i) => ({ userId: id(5000 + (i % 7)), imageID: `crowd-${i}`, status: "completed", source: "contributor", date: ago(300) }));

const sent = (campaign, n, hours, extra = {}) => ({ campaign, userId: id(n), status: "sent", trigger: "auto", sentAt: ago(hours), ...extra });
const audienceOf = async (campaignId, db, now = NOW) => (await findCampaign(campaignId).audience(db, now)).map(String).sort();

describe("the S33 campaigns, by id and by family", () => {
  it("are found by their ids, each milestone and each inactivity round its own campaign", () => {
    expect(Object.keys(CAMPAIGNS)).toEqual([
      "welcome-nudge",
      "milestone-1000", "milestone-1500", "milestone-2000", "milestone-2500",
      "inactivity-1", "inactivity-2", "inactivity-3",
      "exit-questionnaire",
    ]);
    for (const key of Object.keys(CAMPAIGNS)) expect(findCampaign(key).id).toBe(key);
    expect(MILESTONES).toEqual([1000, 1500, 2000, 2500]);
    expect(INACTIVITY_ROUNDS).toBe(3);
    expect(findCampaign("inactivity-4")).toBeNull();
    expect(findCampaign("milestone-500")).toBeNull();
    expect(findCampaign("milestone")).toBeNull();
  });

  it("names the rounds as two families, with what a preview of each sends", () => {
    expect(findFamily("milestone").members.map((c) => c.id)).toEqual(["milestone-1000", "milestone-1500", "milestone-2000", "milestone-2500"]);
    expect(findFamily("milestone").preview.map((c) => c.id)).toEqual(["milestone-1000", "milestone-2500"]);
    expect(findFamily("inactivity").members.map((c) => c.id)).toEqual(["inactivity-1", "inactivity-2", "inactivity-3"]);
    expect(findFamily("inactivity").preview.map((c) => c.id)).toEqual(["inactivity-1"]);
    expect(Object.keys(FAMILIES)).toEqual(["milestone", "inactivity"]);
    for (const name of ["welcome-nudge", "exit-questionnaire", "toString", "all", undefined, 7]) expect(findFamily(name)).toBeNull();
  });

  it("orders a daily run: welcome-nudge, the milestones, the inactivity rounds, and never the exit questionnaire", () => {
    expect(AUTO_ORDER.map((c) => c.id)).toEqual([
      "welcome-nudge",
      "milestone-1000", "milestone-1500", "milestone-2000", "milestone-2500",
      "inactivity-1", "inactivity-2", "inactivity-3",
    ]);
    expect(exitQuestionnaire.manualOnly).toBe(true);
    expect(welcomeNudge.manualFirst).toBe(true);
    for (const c of [...FAMILIES.milestone.members, ...FAMILIES.inactivity.members]) {
      expect(c.manualFirst).toBeUndefined();
      expect(c.manualOnly).toBeUndefined();
    }
  });
});

describe("community milestones, the audience", () => {
  const people = () => [
    contributor(1), // a photo: in
    contributor(2), // no photo
    contributor(3, { isPilot: true }),
    contributor(4, { role: "annotator" }),
    contributor(5, { role: "admin" }),
    contributor(6, { emailOptOutAt: ago(1) }),
    contributor(7, { role: undefined }), // an older row with no role is a contributor: in
    contributor(8), // only a photo in a session still open
    contributor(9, { email: "" }),
  ];
  const photos = () => [photo(1, 30), photo(3, 30), photo(4, 30, { source: "annotator" }), photo(5, 30), photo(6, 30), photo(7, 30, { userId: oid(7) }), photo(8, 2, { status: "pending" }), photo(9, 30)];
  // Eight annotations above, seven of them not an annotator's
  const setup = (total, email_sends = []) => createFakeDb({ users: people(), annotations: [...photos(), ...crowd(total - 7)], email_sends });

  it("counts what the public site counts", async () => {
    const { db } = setup(1000);
    expect(await publicPhotoCount(db)).toBe(1000);
    expect(publicPhotoFilter()).toEqual({ source: { $ne: "annotator" } });
    expect(publicPhotoFilter({ city: "makati" })).toEqual({ city: "makati", source: { $ne: "annotator" } });
    // An annotator's photo is not in the figure
    const { db: none } = createFakeDb({ annotations: [photo(4, 3, { source: "annotator" })] });
    expect(await publicPhotoCount(none)).toBe(0);
  });

  it("sends nothing below 1,000", async () => {
    const { db } = setup(999);
    for (const m of MILESTONES) expect(await audienceOf(`milestone-${m}`, db)).toEqual([]);
    const sorted = await findCampaign("milestone-1000").sort(db, NOW);
    expect(sorted.info).toEqual({ photos: 999, due: false });
    expect(sorted.failed).toEqual([]);
  });

  it("at 1,000 goes to contributors with a photo: not those without, not pilots, annotators, admins or opted-out accounts", async () => {
    const { db } = setup(1000);
    expect(await audienceOf("milestone-1000", db)).toEqual([id(1), id(7)]);
    const sorted = await findCampaign("milestone-1000").sort(db, NOW);
    expect(sorted.info).toEqual({ photos: 1000, due: true });
    // Annotators and admins are never counted, the rest under one reason each
    expect(sorted.excluded).toEqual({ noEmail: 1, pilot: 1, optedOut: 1, noPhoto: 2, alreadySent: 0, failedBefore: 0 });
    for (const m of [1500, 2000, 2500]) expect(await audienceOf(`milestone-${m}`, db)).toEqual([]);
  });

  it("at 1,500 with milestone-1000 never sent, sends only milestone-1500", async () => {
    const { db } = setup(1500);
    expect(await audienceOf("milestone-1000", db)).toEqual([]);
    expect(await audienceOf("milestone-1500", db)).toEqual([id(1), id(7)]);
    expect((await findCampaign("milestone-1000").sort(db, NOW)).info).toEqual({ photos: 1500, due: false });
  });

  it("works the same way at 2,000 and 2,500, and past the last", async () => {
    for (const [total, due] of [[1999, 1500], [2000, 2000], [2499, 2000], [2500, 2500], [2600, 2500]]) {
      const { db } = setup(total);
      for (const m of MILESTONES) expect(await audienceOf(`milestone-${m}`, db), `${total} ${m}`).toEqual(m === due ? [id(1), id(7)] : []);
    }
    expect([999, 1000, 1499, 1500, 2000, 2500, 9000].map((n) => milestoneDue(n))).toEqual([null, 1000, 1000, 1500, 2000, 2500, 2500]);
  });

  it("sends each person a milestone once, and a later milestone again", async () => {
    const { db } = setup(1500, [sent("milestone-1000", 1, 200), sent("milestone-1500", 7, 3)]);
    expect(await audienceOf("milestone-1500", db)).toEqual([id(1)]);
    expect((await findCampaign("milestone-1500").sort(db, NOW)).excluded.alreadySent).toBe(1);
  });

  it("puts a failed send under failedBefore, for retry-failed, only while the person still qualifies", async () => {
    const { db } = setup(1000, [
      { campaign: "milestone-1000", userId: id(1), status: "failed", trigger: "auto" },
      { campaign: "milestone-1000", userId: id(6), status: "failed", trigger: "auto" },
    ]);
    const sorted = await findCampaign("milestone-1000").sort(db, NOW);
    expect(sorted.failed.map((u) => String(u._id))).toEqual([id(1)]);
    expect(sorted.eligible.map((u) => String(u._id))).toEqual([id(7)]);
    expect(sorted.excluded).toMatchObject({ failedBefore: 1, optedOut: 1 });
  });
});

describe("the inactivity reminder, the audience", () => {
  it("is 5 days, 120 hours", () => {
    expect(INACTIVE_AFTER_MS).toBe(120 * HOUR);
  });

  it("does not go at 4 days 23 hours, and goes at 5 days", async () => {
    const { db } = createFakeDb({ users: [contributor(1), contributor(2), contributor(3)], annotations: [photo(1, 119), photo(2, 120), photo(3, 121)] });
    expect(await audienceOf("inactivity-1", db)).toEqual([id(2), id(3)]);
    expect((await findCampaign("inactivity-1").sort(db, NOW)).excluded).toEqual({
      noEmail: 0, pilot: 0, optedOut: 0, noPhoto: 0, otherRound: 0, active: 1, notBack: 0, alreadySent: 0, failedBefore: 0,
    });
  });

  it("follows the latest finished photo, not an older one, an annotator's, or one in a session still open", async () => {
    const { db } = createFakeDb({
      users: [contributor(1), contributor(2), contributor(3), contributor(4)],
      annotations: [
        photo(1, 400), photo(1, 30), // back 30 hours ago: active
        photo(2, 400), photo(2, 10, { status: "pending" }), // the open session's photo does not count
        photo(3, 400, { userId: oid(3) }), // the id stored as an ObjectId
        photo(4, 400), photo(4, 10, { source: "annotator" }),
      ],
    });
    expect(await audienceOf("inactivity-1", db)).toEqual([id(2), id(3), id(4)]);
  });

  it("does not go to someone with no photo, a pilot, an annotator, an admin or an opted-out account", async () => {
    const { db } = createFakeDb({
      users: [
        contributor(1),
        contributor(2), // no photo: welcome-nudge is theirs
        contributor(3, { isPilot: true }),
        contributor(4, { role: "annotator" }),
        contributor(5, { role: "admin" }),
        contributor(6, { emailOptOutAt: ago(2) }),
        contributor(7, { email: null }),
      ],
      annotations: [1, 3, 4, 5, 6, 7].map((n) => photo(n, 200)),
    });
    expect(await audienceOf("inactivity-1", db)).toEqual([id(1)]);
    expect((await findCampaign("inactivity-1").sort(db, NOW)).excluded).toMatchObject({ noPhoto: 1, pilot: 1, optedOut: 1, noEmail: 1 });
    for (const round of [2, 3]) expect(await audienceOf(`inactivity-${round}`, db)).toEqual([]);
  });

  it("sends round 2 only after a photo later than round 1's email, and 5 more quiet days", async () => {
    const users = [contributor(1), contributor(2), contributor(3), contributor(4)];
    const { db } = createFakeDb({
      users,
      annotations: [
        photo(1, 900), // never came back since round 1
        photo(2, 900), photo(2, 130), // came back after round 1, quiet 5 days again
        photo(3, 900), photo(3, 100), // came back, but active in the last 5 days
        photo(4, 900), // never had round 1
      ],
      email_sends: [sent("inactivity-1", 1, 700), sent("inactivity-1", 2, 700), sent("inactivity-1", 3, 700)],
    });
    expect(await audienceOf("inactivity-2", db)).toEqual([id(2)]);
    expect((await findCampaign("inactivity-2").sort(db, NOW)).excluded).toMatchObject({ notBack: 1, active: 1, otherRound: 1 });
    // Round 1 again: only the one who never had it. One quiet spell, one email.
    expect(await audienceOf("inactivity-1", db)).toEqual([id(4)]);
    expect(await audienceOf("inactivity-3", db)).toEqual([]);
  });

  it("counts a photo saved at the very moment of the previous email as not back", async () => {
    const { db } = createFakeDb({
      users: [contributor(1)],
      annotations: [photo(1, 700)],
      email_sends: [sent("inactivity-1", 1, 700)],
    });
    expect(await audienceOf("inactivity-2", db)).toEqual([]);
  });

  it("sends a third round the same way, and never a fourth", async () => {
    const users = [contributor(1)];
    const three = [sent("inactivity-1", 1, 900), sent("inactivity-2", 1, 600), sent("inactivity-3", 1, 300)];
    const { db: third } = createFakeDb({ users, annotations: [photo(1, 1000), photo(1, 800), photo(1, 500)], email_sends: three.slice(0, 2) });
    expect(await audienceOf("inactivity-3", third)).toEqual([id(1)]);
    expect(await audienceOf("inactivity-1", third)).toEqual([]);
    expect(await audienceOf("inactivity-2", third)).toEqual([]);

    // Back and quiet a fourth time: nothing is left to send
    const { db: done } = createFakeDb({ users, annotations: [photo(1, 1000), photo(1, 800), photo(1, 500), photo(1, 200)], email_sends: three });
    for (const round of [1, 2, 3]) expect(await audienceOf(`inactivity-${round}`, done)).toEqual([]);
    expect(Object.keys(CAMPAIGNS).filter((k) => k.startsWith("inactivity-"))).toHaveLength(3);
  });

  it("respects an opt-out made after an earlier round", async () => {
    const { db } = createFakeDb({
      users: [contributor(1, { emailOptOutAt: ago(100) })],
      annotations: [photo(1, 900), photo(1, 200)],
      email_sends: [sent("inactivity-1", 1, 700)],
    });
    expect(await audienceOf("inactivity-2", db)).toEqual([]);
    expect((await findCampaign("inactivity-2").sort(db, NOW)).excluded.optedOut).toBe(1);
  });

  it("waits for a failed earlier round to be retried before the next one", async () => {
    const { db } = createFakeDb({
      users: [contributor(1)],
      annotations: [photo(1, 900)],
      email_sends: [{ campaign: "inactivity-1", userId: id(1), status: "failed", trigger: "auto" }],
    });
    const first = await findCampaign("inactivity-1").sort(db, NOW);
    expect(first.failed.map((u) => String(u._id))).toEqual([id(1)]);
    expect(first.eligible).toEqual([]);
    expect(await audienceOf("inactivity-2", db)).toEqual([]);
  });

  it("leaves out someone in the middle of a session, whose latest photo is recent", async () => {
    const { db } = createFakeDb({ users: [contributor(1)], annotations: [photo(1, 400), photo(1, 1)] });
    expect(await audienceOf("inactivity-1", db)).toEqual([]);
    // Five days on with nothing more, they are in
    expect(await audienceOf("inactivity-1", db, new Date(NOW.getTime() + 5 * DAY))).toEqual([id(1)]);
  });
});

describe("the exit questionnaire invitation, the audience", () => {
  it("includes contributors with no photo and accounts created today, and leaves out pilots, annotators, admins and opted-out accounts", async () => {
    const { db } = createFakeDb({
      users: [
        contributor(1), // a photo
        contributor(2), // no photo
        contributor(3, { createdAt: NOW }), // created today
        contributor(4, { isPilot: true }),
        contributor(5, { role: "annotator" }),
        contributor(6, { role: "admin" }),
        contributor(7, { emailOptOutAt: ago(1) }),
        contributor(8, { role: undefined, emailVerifiedAt: null }), // no role, address not confirmed: in
        contributor(9), // already sent
      ],
      annotations: [photo(1, 50)],
      email_sends: [sent("exit-questionnaire", 9, 1, { trigger: "manual" }), sent("welcome-nudge", 2, 500)],
    });
    expect(await audienceOf("exit-questionnaire", db)).toEqual([id(1), id(2), id(3), id(8)]);
    expect((await exitQuestionnaire.sort(db, NOW)).excluded).toEqual({ noEmail: 0, pilot: 1, optedOut: 1, alreadySent: 1, failedBefore: 0 });
  });
});

// ---------------------------------------------------------------------------
// The words (S33 spec, "The words", read by Rans 17 Nov 2026, no change asked)
// ---------------------------------------------------------------------------

const END = (stop) => `Thank you for joining us in knowing our streets better.

Francis Bawa, Imprint
BSMS Computer Science, DLSU

You're getting this because you signed up for Imprint. Don't want emails like this? Stop these emails: ${stop}`;

const MILESTONE_1000 = (stop) => `Hey Rans!

Together, Imprint's contributors have now finished 1,000 street photos, and you are part of that.

Every photo helps us understand sidewalks the way the people who walk them do. Our next goal is 1,500 photos.

Keep going: ${ORIGIN}/contribute

${END(stop)}`;

const MILESTONE_2500 = (stop) => `Hey Rans!

Together, Imprint's contributors have now finished 2,500 street photos, and you are part of that.

Every photo helps us understand sidewalks the way the people who walk them do.

Keep going: ${ORIGIN}/contribute

${END(stop)}`;

const INACTIVITY = (stop) => `Hey Rans!

It's been a few days since your last session on Imprint, so this is a friendly reminder.

A session of 5 photos takes about 5 minutes, and it works on your phone, tablet or desktop. You can stop anytime.

Continue annotating: ${ORIGIN}/contribute

${END(stop)}`;

const EXIT = (stop) => `Hey Rans!

The Imprint study is coming to a close. Thank you for being part of it.

Before we wrap up, we'd love to hear about your experience. The exit questionnaire is optional and takes a few minutes. Your answers help us understand what worked and what didn't.

Answer the questionnaire: ${ORIGIN}/contribute/exit-survey

${END(stop)}`;

const rans = contributor(1, { username: "Rans", email: "rans@example.org" });
const build = (campaignId, user = rans) => buildCampaignMail(findCampaign(campaignId), user, "standard", ENV);
const stopUrl = (mail) => /Stop these emails: (\S+)$/.exec(mail.text)[1];
const htmlText = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const EVERY_ID = Object.keys(CAMPAIGNS).filter((k) => k !== "welcome-nudge");

describe("the S33 words", () => {
  it("are the approved subject, text and bell for a milestone with a next goal", () => {
    const { mail, bell } = build("milestone-1000");
    expect(mail.subject).toBe("We've reached 1,000 photos on Imprint!");
    expect(mail.text).toBe(MILESTONE_1000(stopUrl(mail)));
    expect(bell).toEqual({
      title: "1,000 photos reached!",
      activity: "Imprint's contributors have finished 1,000 photos. Thank you for being part of it.",
      href: "/contribute",
    });
  });

  it("name each milestone and the one after it", () => {
    for (const [m, next] of [["1,000", "1,500"], ["1,500", "2,000"], ["2,000", "2,500"]]) {
      const { mail, bell } = build(`milestone-${m.replace(",", "")}`);
      expect(mail.subject).toBe(`We've reached ${m} photos on Imprint!`);
      expect(mail.text).toContain(`have now finished ${m} street photos, and you are part of that.`);
      expect(mail.text).toContain(`walk them do. Our next goal is ${next} photos.\n`);
      expect(bell.title).toBe(`${m} photos reached!`);
      expect(bell.activity).toBe(`Imprint's contributors have finished ${m} photos. Thank you for being part of it.`);
    }
  });

  it("leave the next goal out of the last milestone", () => {
    const { mail, bell } = build("milestone-2500");
    expect(mail.subject).toBe("We've reached 2,500 photos on Imprint!");
    expect(mail.text).toBe(MILESTONE_2500(stopUrl(mail)));
    expect(mail.text).not.toContain("next goal");
    expect(mail.html).not.toContain("next goal");
    expect(bell.title).toBe("2,500 photos reached!");
  });

  it("are the approved subject, text and bell for the inactivity reminder, the same in each round", () => {
    for (const round of [1, 2, 3]) {
      const { mail, bell } = build(`inactivity-${round}`);
      expect(mail.subject).toBe("Your sidewalks are waiting on Imprint");
      expect(mail.text).toBe(INACTIVITY(stopUrl(mail)));
      expect(bell).toEqual({ title: "Ready for another session?", activity: "A session of 5 photos takes about 5 minutes.", href: "/contribute" });
    }
  });

  it("take 5 photos and about 5 minutes from FIRST_SESSION", () => {
    const { mail, bell } = build("inactivity-1");
    expect(mail.text).toContain(`A session of ${FIRST_SESSION.photos} photos takes about ${FIRST_SESSION.minutes} minutes, and it works`);
    expect(bell.activity).toBe(`A session of ${FIRST_SESSION.photos} photos takes about ${FIRST_SESSION.minutes} minutes.`);
  });

  it("are the approved subject, text and bell for the exit questionnaire invitation, whose button and bell open the questionnaire", () => {
    const { mail, bell } = build("exit-questionnaire");
    expect(mail.subject).toBe("One last thing from Imprint");
    expect(mail.text).toBe(EXIT(stopUrl(mail)));
    expect(bell).toEqual({ title: "Tell us about your experience", activity: "The optional exit questionnaire takes a few minutes.", href: "/contribute/exit-survey" });
    expect(mail.html).toContain(`<a href="${ORIGIN}/contribute/exit-survey" style="background-color:#004aad;color:#ffffff;`);
    expect(mail.html).toContain(`>${ORIGIN}/contribute/exit-survey</a>`);
  });

  it("say the same words in the html, in the same order as the text", () => {
    for (const campaignId of EVERY_ID) {
      const { mail } = build(campaignId);
      const words = htmlText(mail.html);
      let from = 0;
      for (const line of mail.text.split("\n").filter(Boolean)) {
        const plain = line.replace(/: https?:\/\/\S+$/, "");
        const at = words.indexOf(plain, from);
        expect(at, `${campaignId}: ${plain}`).toBeGreaterThanOrEqual(from);
        from = at;
      }
    }
  });

  it("have no em dash and no semicolon in any subject, text, html or bell", () => {
    for (const campaignId of EVERY_ID) {
      const { mail, bell } = build(campaignId);
      for (const s of [mail.subject, mail.text, htmlText(mail.html), bell.title, bell.activity]) {
        expect(s).not.toMatch(/—/);
        expect(s).not.toContain(";");
      }
    }
  });

  it("escape the username in the html", () => {
    for (const campaignId of EVERY_ID) {
      const { mail } = build(campaignId, contributor(1, { username: "<b>&\"x'" }));
      expect(mail.html).toContain("Hey &lt;b&gt;&amp;&quot;x&#39;!");
      expect(mail.html).not.toContain("<b>&");
    }
  });

  it("have a working stop link in every email, and the one-click headers", () => {
    for (const campaignId of EVERY_ID) {
      const { mail } = build(campaignId);
      const page = new URL(stopUrl(mail));
      expect(page.pathname).toBe("/unsubscribe");
      expect(checkUnsubscribe(page.searchParams.get("u"), page.searchParams.get("t"), ENV.NEXTAUTH_SECRET)).toBe(true);
      expect(mail.html).toContain(">Stop these emails</a>");
      expect(mail.html).toContain(page.href.replace(/&/g, "&amp;"));
      const oneClick = new URL(/^<(.+)>$/.exec(mail.headers["List-Unsubscribe"])[1]);
      expect(oneClick.pathname).toBe("/api/email/unsubscribe");
      expect(oneClick.searchParams.get("t")).toBe(page.searchParams.get("t"));
      expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    }
  });

  it("look as welcome-nudge does: the centered logo header, black text, one blue button with its link under it, the sign-off, and no animation", () => {
    for (const campaignId of EVERY_ID) {
      const { mail } = build(campaignId);
      const at = (s) => mail.html.indexOf(s);
      expect(mail.html).toContain('<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto 24px">');
      expect(at(`<img src="${ORIGIN}/images/email/logo.png" width="28" height="40" alt="Imprint"`)).toBeGreaterThan(-1);
      expect(at(">Imprint</a>")).toBeLessThan(at("Hey Rans!"));
      expect(mail.html).not.toContain("how-it-works.gif");
      expect(mail.html.match(/background-color:#004aad/g)).toHaveLength(1);
      const colours = [...mail.html.matchAll(/(?<![-\w])color:(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());
      expect(new Set(colours)).toEqual(new Set(["#000000", "#ffffff", "#004aad"]));
      expect(mail.html).toContain("Thank you for joining us in knowing our streets better.<br><br>Francis Bawa, Imprint<br>BSMS Computer Science, DLSU</p>");
      expect(mail.html).not.toMatch(/https:\/\/imprint\.example\.org\/\//);
      expect(mail.to).toBe("rans@example.org");
      expect(mail.text.startsWith("Hey Rans!")).toBe(true);
    }
  });
});
