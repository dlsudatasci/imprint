import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { createFakeDb } from "@/test-utils/fakeMongo";
import { welcomeNudge, sortAudience, findCampaign, ANIMATION_ALT, NUDGE_AFTER_MS, signedUpAt } from "./campaigns.mjs";
import { buildCampaignMail } from "./sendCampaign.mjs";
import { FIRST_SESSION } from "@/features/annotate/firstSession.mjs";
import { checkUnsubscribe } from "@/util/emailLinks.mjs";

/**
 * The first participant campaign, `welcome-nudge` (S29, 16 Nov 2026): who it
 * goes to, and its words exactly as Rans approved them.
 */
const NOW = new Date("2026-11-16T01:30:00Z");
const HOUR = 60 * 60 * 1000;
const ago = (hours) => new Date(NOW.getTime() - hours * HOUR);
const oid = (n) => new ObjectId(String(n).padStart(24, "0"));
const ENV = { NEXTAUTH_URL: "https://imprint.example.org/", NEXTAUTH_SECRET: "test-secret", EMAIL_USER: "imprint@example.org", EMAIL_PASS: "x" };

const contributor = (n, extra = {}) => ({
  _id: oid(n),
  role: "user",
  username: `user${n}`,
  email: `user${n}@example.org`,
  emailVerifiedAt: ago(200),
  createdAt: ago(100),
  ...extra,
});

function audienceDb() {
  const users = [
    contributor(1), // in
    contributor(2, { emailVerifiedAt: null }), // in, pending-only (confirm)
    contributor(3, { role: "annotator" }),
    contributor(4, { role: "admin" }),
    contributor(5, { isPilot: true }),
    contributor(6, { emailOptOutAt: ago(1) }),
    contributor(7, { createdAt: ago(71) }), // too new
    contributor(8, { createdAt: ago(73) }), // in
    contributor(9), // has a completed annotation, userId a string
    contributor(10), // has a completed annotation, userId an ObjectId
    contributor(11), // only a pending annotation: in
    contributor(12), // already sent
    contributor(13, { role: undefined }), // an older row with no role is a contributor: in
  ];
  const annotations = [
    { userId: oid(9).toString(), status: "completed" },
    { userId: oid(10), status: "completed" },
    { userId: oid(11).toString(), status: "pending" },
    { userId: oid(1).toString(), status: "draft" },
  ];
  const email_sends = [
    { campaign: "welcome-nudge", userId: oid(12).toString(), status: "sent", trigger: "manual" },
    // Another campaign's send does not count
    { campaign: "something-else", userId: oid(1).toString(), status: "sent", trigger: "manual" },
  ];
  return createFakeDb({ users, annotations, email_sends });
}

describe("welcome-nudge audience", () => {
  it("leaves out annotators, admins, pilots, opted-out accounts, accounts under 3 days old, those with a completed annotation, and those already sent", async () => {
    const { db } = audienceDb();
    const ids = (await welcomeNudge.audience(db, NOW)).map(String);
    expect(ids.sort()).toEqual([1, 2, 8, 11, 13].map((n) => oid(n).toString()).sort());
  });

  it("counts each left-out contributor under one reason, and never counts annotators or admins", async () => {
    const { db } = audienceDb();
    const { excluded, eligible } = await sortAudience(db, "welcome-nudge", NOW);
    expect(eligible).toHaveLength(5);
    expect(excluded).toEqual({ noEmail: 0, pilot: 1, optedOut: 1, tooNew: 1, hasAnnotation: 2, alreadySent: 1, failedBefore: 0 });
  });

  it("puts 72 hours as the line: 71 hours is too new and 73 is in", async () => {
    expect(NUDGE_AFTER_MS).toBe(72 * HOUR);
    const { db } = createFakeDb({ users: [contributor(1, { createdAt: ago(71) }), contributor(2, { createdAt: ago(73) })] });
    expect((await welcomeNudge.audience(db, NOW)).map(String)).toEqual([oid(2).toString()]);
  });

  it("reads an older row's sign-up time from its ObjectId when createdAt is missing", () => {
    const old = ObjectId.createFromTime(Math.floor(ago(500).getTime() / 1000));
    expect(signedUpAt({ _id: old })).toBe(Math.floor(ago(500).getTime() / 1000) * 1000);
    expect(signedUpAt({ _id: "x" })).toBeNaN();
  });

  it("includes a pending-only account, and moves a failed send to failedBefore for retry-failed", async () => {
    const { db } = createFakeDb({
      users: [contributor(1, { emailVerifiedAt: null }), contributor(2)],
      email_sends: [{ campaign: "welcome-nudge", userId: oid(2).toString(), status: "failed" }],
    });
    const { eligible, failed, excluded } = await sortAudience(db, "welcome-nudge", NOW);
    expect(eligible.map((u) => String(u._id))).toEqual([oid(1).toString()]);
    expect(failed.map((u) => String(u._id))).toEqual([oid(2).toString()]);
    expect(excluded.failedBefore).toBe(1);
  });

  it("treats a send left 'sending' for over 15 minutes as failed, and a fresh one as sent", async () => {
    const { db } = createFakeDb({
      users: [contributor(1), contributor(2)],
      email_sends: [
        { campaign: "welcome-nudge", userId: oid(1).toString(), status: "sending", claimedAt: new Date(NOW.getTime() - 16 * 60000) },
        { campaign: "welcome-nudge", userId: oid(2).toString(), status: "sending", claimedAt: new Date(NOW.getTime() - 60000) },
      ],
    });
    const { failed, excluded } = await sortAudience(db, "welcome-nudge", NOW);
    expect(failed.map((u) => String(u._id))).toEqual([oid(1).toString()]);
    expect(excluded.alreadySent).toBe(1);
  });

  it("follows emailVerifiedAt for the variant", () => {
    expect(welcomeNudge.variant({ emailVerifiedAt: NOW })).toBe("start");
    expect(welcomeNudge.variant({ emailVerifiedAt: null })).toBe("confirm");
    expect(welcomeNudge.variant({})).toBe("confirm");
  });

  it("is found by its id, and nothing else is", () => {
    expect(findCampaign("welcome-nudge")).toBe(welcomeNudge);
    expect(findCampaign("nope")).toBeNull();
    expect(findCampaign("toString")).toBeNull();
  });
});

// The approved words (S29 spec, "The first campaign's words"), here as the
// text email reads them
const ORIGIN = "https://imprint.example.org";
const START_TEXT = (stop) => `Hey Rans!

Thanks for signing up on Imprint. We noticed you haven't started a session yet, so this is a friendly nudge.

You can start with just 5 photos, which takes about 5 minutes. You look at street photos from Metro Manila and tell us what gets in your way on the sidewalk. You can do more if you like, and you can stop anytime.

Every answer helps us understand sidewalks the way the people who walk them do.

Start a session: ${ORIGIN}/contribute

Thank you for being part of this!
Francis Bawa, Imprint

You're getting this because you signed up for Imprint. Don't want emails like this? Stop these emails: ${stop}`;

const CONFIRM_TEXT = (stop) => `Hey Rans!

Thanks for signing up on Imprint. We noticed you haven't started a session yet, and there's one step left: please confirm your email to start annotating.

Sign in and click Resend to get a new confirmation link, since the first one only lasts a day. Then you're all set.

You can start with just 5 photos, which takes about 5 minutes. You look at street photos from Metro Manila and tell us what gets in your way on the sidewalk.

Sign in to confirm: ${ORIGIN}/contribute

Thank you for being part of this!
Francis Bawa, Imprint

You're getting this because you signed up for Imprint. Don't want emails like this? Stop these emails: ${stop}`;

const rans = contributor(1, { username: "Rans", email: "rans@example.org" });
const stopUrl = (mail) => /Stop these emails: (\S+)$/.exec(mail.text)[1];
const htmlText = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

describe("welcome-nudge words", () => {
  const start = buildCampaignMail(welcomeNudge, rans, "start", ENV);
  const confirm = buildCampaignMail(welcomeNudge, rans, "confirm", ENV);

  it("are the approved subject, text and bell for the start variant", () => {
    expect(start.mail.subject).toBe("Your first sidewalk is waiting on Imprint");
    expect(start.mail.text).toBe(START_TEXT(stopUrl(start.mail)));
    expect(start.bell).toEqual({ title: "Your first session is waiting", activity: "Start with 5 photos, about 5 minutes." });
  });

  it("are the approved subject, text and bell for the confirm variant", () => {
    expect(confirm.mail.subject).toBe("One step left to start on Imprint");
    expect(confirm.mail.text).toBe(CONFIRM_TEXT(stopUrl(confirm.mail)));
    expect(confirm.bell).toEqual({ title: "Confirm your email", activity: "Please confirm your email to start annotating." });
  });

  it("say the same words in the html, in the same order, with the animation after the 5 photos paragraph and before the button", () => {
    for (const [mail, button, after] of [[start.mail, "Start a session", "Every answer helps"], [confirm.mail, "Sign in to confirm", null]]) {
      const words = htmlText(mail.html);
      // Every line of the text email is in the html, apart from the written-out link labels
      for (const line of mail.text.split("\n").filter(Boolean)) {
        const plain = line.replace(/: https?:\/\/\S+$/, "");
        expect(words).toContain(plain);
      }
      const at = (s) => mail.html.indexOf(s);
      expect(at("You can start with just 5 photos")).toBeLessThan(at("<img"));
      expect(at("<img")).toBeLessThan(at(`>${button}</a>`));
      if (after) expect(at("<img")).toBeLessThan(at(after));
    }
  });

  it("have no em dash and no semicolon in any subject, text, html or bell", () => {
    for (const { mail, bell } of [start, confirm]) {
      for (const s of [mail.subject, mail.text, htmlText(mail.html), bell.title, bell.activity]) {
        expect(s).not.toMatch(/—/);
        expect(s).not.toContain(";");
      }
    }
  });

  it("escape the username in the html", () => {
    const sly = buildCampaignMail(welcomeNudge, contributor(1, { username: "<b>&\"x'" }), "start", ENV);
    expect(sly.mail.html).toContain("Hey &lt;b&gt;&amp;&quot;x&#39;!");
    expect(sly.mail.html).not.toContain("<b>&");
  });

  it("have the animation, with its alt text and link, in the html only", () => {
    for (const { mail, bell } of [start, confirm]) {
      expect(mail.html).toContain(`<a href="${ORIGIN}/contribute"`);
      expect(mail.html).toContain(`<img src="${ORIGIN}/images/email/how-it-works.gif" width="600" alt="${ANIMATION_ALT}"`);
      expect(mail.html).toContain('style="display:block;width:100%;max-width:600px;height:auto;border:0"');
      expect(mail.text).not.toContain("how-it-works.gif");
      expect(JSON.stringify(bell)).not.toContain("how-it-works.gif");
    }
  });

  it("have a working stop link in every email, and the one-click headers", () => {
    for (const { mail } of [start, confirm]) {
      const page = new URL(stopUrl(mail));
      expect(page.pathname).toBe("/unsubscribe");
      expect(checkUnsubscribe(page.searchParams.get("u"), page.searchParams.get("t"), ENV.NEXTAUTH_SECRET)).toBe(true);
      expect(mail.html).toContain(`>Stop these emails</a>`);
      expect(mail.html).toContain(page.href.replace(/&/g, "&amp;"));
      const header = /^<(.+)>$/.exec(mail.headers["List-Unsubscribe"])[1];
      const oneClick = new URL(header);
      expect(oneClick.pathname).toBe("/api/email/unsubscribe");
      expect(oneClick.searchParams.get("t")).toBe(page.searchParams.get("t"));
      expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    }
  });

  it("take 5 photos and about 5 minutes from FIRST_SESSION", () => {
    expect(start.mail.text).toContain(`just ${FIRST_SESSION.photos} photos, which takes about ${FIRST_SESSION.minutes} minutes`);
    expect(confirm.mail.text).toContain(`just ${FIRST_SESSION.photos} photos, which takes about ${FIRST_SESSION.minutes} minutes`);
    expect(start.bell.activity).toBe(`Start with ${FIRST_SESSION.photos} photos, about ${FIRST_SESSION.minutes} minutes.`);
  });

  it("go to the person's address, signed Francis Bawa, Imprint, with no doubled slash in any link", () => {
    expect(start.mail.to).toBe("rans@example.org");
    expect(start.mail.text).toContain("Francis Bawa, Imprint");
    expect(start.mail.html).not.toMatch(/https:\/\/imprint\.example\.org\/\//);
  });
});
