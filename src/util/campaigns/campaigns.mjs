import { FIRST_SESSION } from "../../features/annotate/firstSession.mjs";
import { publicPhotoCount } from "../publicPhotoCount.mjs";

/**
 * Participant email campaigns (S29, 16 Nov 2026). Plain Node with no `@/`
 * imports, so the sender, the route and tests share one definition.
 *
 * Each campaign is a record:
 * - `id`, also the `campaign` field of every send in `email_sends`
 * - `audience(db, now)`: who it goes to, with how many were left out and why
 * - `variant(user)`: which version of the words
 * - `message(user, variant, links)`: `{ subject, text, html }` for the email
 *   and `{ title, activity }` for the bell
 *
 * The words are final as Rans approved them on 16 Nov 2026 (S29 spec, "The
 * first campaign's words"), changed the same day (fix/s29-email-wording-and-
 * look): "friendly reminder", the devices line, the confirm steps named by
 * their buttons, a third sign-off line, all text black and a logo header.
 * No em dashes and no semicolons, checked by campaigns.test.js.
 *
 * S33 (17 Nov 2026) adds three kinds, each also a bell message that opens a
 * page: the community milestones (`milestone-1000` to `milestone-2500`), the
 * inactivity reminder (`inactivity-1` to `inactivity-3`) and the exit
 * questionnaire invitation (`exit-questionnaire`, by hand only). A kind sent
 * more than once is several campaigns, one per round, so the unique index on
 * `{ campaign, userId }` still means one email per person per round. Each
 * campaign also has `sort(db, now)`, which the sender calls: `{ eligible,
 * excluded, failed, info? }`. Their words are in the S33 spec, read by Rans
 * on 17 Nov 2026, and checked by eventCampaigns.test.js.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A send still marked "sending" after this long was cut off before it finished. */
export const STALE_CLAIM_MS = 15 * 60 * 1000;

/** How old an account must be before it is nudged. */
export const NUDGE_AFTER_MS = 3 * DAY_MS;

/** The order in which a left-out account is counted, the first reason that fits. */
export const EXCLUSION_REASONS = Object.freeze(["noEmail", "pilot", "optedOut", "tooNew", "hasAnnotation", "alreadySent", "failedBefore"]);

export const ANIMATION_ALT = "How Imprint works: look at a street photo, answer two questions for each object, and draw what we missed.";
export const ANIMATION_PATH = "/images/email/how-it-works.gif";
/** The header's fingerprint logo, 67 by 96, drawn at 28 by 40. */
export const LOGO_PATH = "/images/email/logo.png";
export const LOGO_ALT = "Imprint";

/**
 * The labels of the two buttons the confirm email names: the dashboard's
 * `confirmEmail` (dashboardCopy.js) and Check your inbox's `resend`
 * (authCopy.js). Written out here because this file stays plain Node, and
 * campaigns.test.js reads them from those copy files, so the email cannot
 * drift from the buttons.
 */
export const CONFIRM_BUTTON_LABEL = "Confirm Your Email to Start";
export const RESEND_BUTTON_LABEL = "Send a new link";

// The empty line puts a blank line between the thanks and the name, in the
// text email and (as two <br>) in the html (Rans, 16 Nov 2026)
const SIGN_OFF = ["Thank you for joining us in knowing our streets better.", "", "Francis Bawa, Imprint", "BSMS Computer Science, DLSU"];
const FOOTER = "You're getting this because you signed up for Imprint. Don't want emails like this?";
const STOP = "Stop these emails";

const firstSessionLine = `You can start with just ${FIRST_SESSION.photos} photos, which takes about ${FIRST_SESSION.minutes} minutes.`;
const whatYouDo = "You look at street photos from Metro Manila and tell us what gets in your way on the sidewalk. It works on your phone, tablet or desktop.";

/**
 * The words of `welcome-nudge`, per variant. `paragraphs` are the body before
 * the animation, `after` the body after it and before the button.
 */
export const WELCOME_NUDGE_COPY = Object.freeze({
  start: Object.freeze({
    subject: "Your first sidewalk is waiting on Imprint",
    paragraphs: [
      "Thanks for signing up on Imprint. We noticed you haven't started a session yet, so this is a friendly reminder.",
      `${firstSessionLine} ${whatYouDo} You can do more if you like, and you can stop anytime.`,
    ],
    after: ["Every answer helps us understand sidewalks the way the people who walk them do."],
    button: "Start a session",
    bell: Object.freeze({
      title: "Your first session is waiting",
      activity: `Start with ${FIRST_SESSION.photos} photos, about ${FIRST_SESSION.minutes} minutes.`,
    }),
  }),
  confirm: Object.freeze({
    subject: "One step left to start on Imprint",
    paragraphs: [
      "Thanks for signing up on Imprint. We noticed you haven't started a session yet, and there's one step left: please confirm your email to start annotating.",
      `Sign in, click ${CONFIRM_BUTTON_LABEL}, then click ${RESEND_BUTTON_LABEL}, since the first one only lasts a day. Then you're all set.`,
      `${firstSessionLine} ${whatYouDo}`,
    ],
    after: [],
    button: "Sign in to confirm",
    bell: Object.freeze({
      title: "Confirm your email",
      activity: "Please confirm your email to start annotating.",
    }),
  }),
});

export function greeting(username) {
  return username ? `Hey ${username}!` : "Hey!";
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A user id as text, whether it came as an ObjectId or a string. */
export const idText = (id) => (id == null ? "" : String(id));

/** When the account was made: `createdAt`, or the time inside its ObjectId for an older row without one. */
export function signedUpAt(user) {
  const created = user?.createdAt ? new Date(user.createdAt).getTime() : NaN;
  if (!Number.isNaN(created)) return created;
  const id = idText(user?._id);
  if (/^[0-9a-f]{24}$/i.test(id)) return parseInt(id.slice(0, 8), 16) * 1000;
  return NaN;
}

// All text black (Rans, 16 Nov 2026). The button stays white on blue, and links blue.
const BLACK = "#000000";
const BLUE = "#004aad";
const p = (text) => `<p style="color:${BLACK};font-size:16px;line-height:1.6;margin:0 0 16px">${escapeHtml(text)}</p>`;

/**
 * The logo and the word Imprint side by side, centered at the top (Rans,
 * 16 Nov 2026), both linked to the site. A one-row table, which Gmail and
 * Outlook both keep on one line, centered by `align="center"` for Outlook
 * and `margin:0 auto` for the rest.
 */
function header(origin) {
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto 24px"><tr>
<td style="vertical-align:middle;padding:0 10px 0 0"><a href="${origin}" style="text-decoration:none"><img src="${origin}${LOGO_PATH}" width="28" height="40" alt="${LOGO_ALT}" style="display:inline-block;vertical-align:middle;border:0"></a></td>
<td style="vertical-align:middle"><a href="${origin}" style="color:${BLACK};text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;line-height:40px">Imprint</a></td>
</tr></table>`;
}

/**
 * The email and the bell entry for one person, from a campaign's words `c`:
 * `{ subject, paragraphs, after?, animation?, button, bell }`. `links` is
 * `{ origin, action, unsubscribe, oneClick }`: the site without a trailing
 * slash, the button's address, the stop page and the one-click address for
 * the List-Unsubscribe header. Every campaign has the same look: the logo
 * header, black text, one blue button with its link written under it, the
 * sign-off and the stop line. `welcome-nudge` and the inactivity reminder
 * have the animation (the reminder from 18 Nov 2026, Rans), in the html
 * only. The milestones and the exit questionnaire invitation do not.
 */
function renderMessage(user, links, c) {
  const hello = greeting(user?.username);
  const after = c.after || [];

  const text = [
    hello,
    "",
    ...c.paragraphs.flatMap((x) => [x, ""]),
    ...after.flatMap((x) => [x, ""]),
    `${c.button}: ${links.action}`,
    "",
    ...SIGN_OFF,
    "",
    `${FOOTER} ${STOP}: ${links.unsubscribe}`,
  ].join("\n");

  const action = escapeHtml(links.action);
  const stop = escapeHtml(links.unsubscribe);
  const origin = escapeHtml(links.origin);
  const parts = [
    header(origin),
    p(hello),
    ...c.paragraphs.map(p),
    ...(c.animation
      ? [`<a href="${origin}/contribute" style="display:block;margin:0 0 16px"><img src="${origin}${ANIMATION_PATH}" width="600" alt="${escapeHtml(ANIMATION_ALT)}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a>`]
      : []),
    ...after.map(p),
    `<div style="text-align:center;margin:24px 0 8px"><a href="${action}" style="background-color:${BLUE};color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">${escapeHtml(c.button)}</a></div>`,
    `<p style="color:${BLACK};font-size:12px;text-align:center;margin:0 0 24px"><a href="${action}" style="color:${BLUE};word-break:break-all">${action}</a></p>`,
    `<p style="color:${BLACK};font-size:16px;line-height:1.6;margin:0 0 24px">${SIGN_OFF.map(escapeHtml).join("<br>")}</p>`,
    `<hr style="border:0;border-top:1px solid #e2e8f0;margin:0 0 16px">`,
    `<p style="color:${BLACK};font-size:12px;line-height:1.5;margin:0">${escapeHtml(FOOTER)} <a href="${stop}" style="color:${BLUE}">${STOP}</a></p>`,
  ];
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px 16px;background:#ffffff;color:${BLACK}">
${parts.join("\n")}
</div>`;

  return {
    email: { subject: c.subject, text, html },
    // `href` (S33) is the page the bell message opens, a path on this site
    bell: { title: c.bell.title, activity: c.bell.activity, ...(c.bell.href ? { href: c.bell.href } : {}) },
  };
}

function welcomeNudgeMessage(user, variant, links) {
  const c = WELCOME_NUDGE_COPY[variant];
  if (!c) throw new Error(`welcome-nudge has no variant "${variant}"`);
  return renderMessage(user, links, { ...c, animation: true });
}

/**
 * Sorts every contributor into the audience or one reason for leaving them
 * out. Annotators and admins are never counted at all. Reads `users`,
 * `annotations` (completed ones, `userId` stored as a string or an ObjectId)
 * and this campaign's `email_sends`.
 *
 * Returns `{ eligible: [user], excluded: { reason: count }, failed: [user] }`.
 * `failed` are those whose earlier send failed and who would otherwise be in
 * the audience now, for the retry-failed mode.
 */
export async function sortAudience(db, campaignId, now = new Date()) {
  const users = await db
    .collection("users")
    .find(
      { role: { $in: ["user", null] } },
      { projection: { _id: 1, username: 1, email: 1, emailVerifiedAt: 1, createdAt: 1, isPilot: 1, emailOptOutAt: 1 } },
    )
    .toArray();

  const annotated = new Set(
    (await db.collection("annotations").distinct("userId", { status: "completed" })).map(idText),
  );
  const sends = new Map();
  for (const s of await db.collection("email_sends").find({ campaign: campaignId }, { projection: { userId: 1, status: 1, claimedAt: 1 } }).toArray()) {
    // A claim left "sending" for long is a run that stopped mid-send: the
    // email may not have gone, so it counts as failed and retry-failed takes it
    const stale = s.status === "sending" && now.getTime() - new Date(s.claimedAt).getTime() > STALE_CLAIM_MS;
    sends.set(idText(s.userId), stale ? "failed" : s.status);
  }

  const cutoff = now.getTime() - NUDGE_AFTER_MS;
  const excluded = Object.fromEntries(EXCLUSION_REASONS.map((r) => [r, 0]));
  const eligible = [];
  const failed = [];
  for (const user of users) {
    const id = idText(user._id);
    const signedUp = signedUpAt(user);
    const sent = sends.get(id);
    let reason = null;
    if (!user.email) reason = "noEmail";
    else if (user.isPilot) reason = "pilot";
    else if (user.emailOptOutAt) reason = "optedOut";
    else if (Number.isNaN(signedUp) || signedUp > cutoff) reason = "tooNew";
    else if (annotated.has(id)) reason = "hasAnnotation";
    else if (sent === "failed") reason = "failedBefore";
    else if (sent) reason = "alreadySent";

    if (reason) excluded[reason] += 1;
    if (reason === "failedBefore") failed.push(user);
    if (!reason) eligible.push(user);
  }
  return { eligible, excluded, failed };
}

export const welcomeNudge = Object.freeze({
  id: "welcome-nudge",
  variants: Object.freeze(["start", "confirm"]),
  /** The daily task sends it only after Rans has sent it once by hand (S29). */
  manualFirst: true,
  sort(db, now = new Date()) {
    return sortAudience(db, this.id, now);
  },
  async audience(db, now = new Date()) {
    const { eligible } = await sortAudience(db, this.id, now);
    return eligible.map((u) => u._id);
  },
  variant(user) {
    return user?.emailVerifiedAt ? "start" : "confirm";
  },
  /** The button's address for a variant. Both go to /contribute: signed out, that is the sign-in. */
  actionPath() {
    return "/contribute";
  },
  message: welcomeNudgeMessage,
});

// ---------------------------------------------------------------------------
// S33: community milestones, the inactivity reminder, the exit questionnaire
// ---------------------------------------------------------------------------

/** The community milestones, in photos finished by contributors. Rans can add to the list. */
export const MILESTONES = Object.freeze([1000, 1500, 2000, 2500]);
/** A contributor is reminded once their latest finished photo is this old. */
export const INACTIVE_AFTER_MS = 5 * DAY_MS;
/** At most this many reminders per person in the whole study. */
export const INACTIVITY_ROUNDS = 3;
export const EXIT_QUESTIONNAIRE_ID = "exit-questionnaire";
export const EXIT_QUESTIONNAIRE_PATH = "/contribute/exit-survey";

/** These campaigns have one version of their words. */
const ONE_VARIANT = "standard";
const ONE_VARIANT_LIST = Object.freeze([ONE_VARIANT]);

/** 1000 as "1,000" */
export const photosText = (n) => Number(n).toLocaleString("en-US");

/** The words of a milestone email. `next` is the next goal, or null for the last milestone. */
export function milestoneCopy(milestone, next = null) {
  const n = photosText(milestone);
  const why = "Every photo helps us understand sidewalks the way the people who walk them do.";
  return {
    subject: `We've reached ${n} photos on Imprint!`,
    paragraphs: [
      `Together, Imprint's contributors have now finished ${n} street photos, and you are part of that.`,
      next ? `${why} Our next goal is ${photosText(next)} photos.` : why,
    ],
    button: "Keep going",
    bell: {
      title: `${n} photos reached!`,
      activity: `Imprint's contributors have finished ${n} photos. Thank you for being part of it.`,
      href: "/contribute",
    },
  };
}

/** The words of the inactivity reminder, the same in each round. */
export const INACTIVITY_COPY = Object.freeze({
  subject: "Your sidewalks are waiting on Imprint",
  paragraphs: Object.freeze([
    "It's been a few days since your last session on Imprint, so this is a friendly reminder.",
    `A session of ${FIRST_SESSION.photos} photos takes about ${FIRST_SESSION.minutes} minutes, and it works on your phone, tablet or desktop. You can stop anytime.`,
  ]),
  button: "Continue annotating",
  bell: Object.freeze({
    title: "Ready for another session?",
    activity: `A session of ${FIRST_SESSION.photos} photos takes about ${FIRST_SESSION.minutes} minutes.`,
    href: "/contribute",
  }),
});

/** The words of the exit questionnaire invitation. */
export const EXIT_QUESTIONNAIRE_COPY = Object.freeze({
  subject: "One last thing from Imprint",
  paragraphs: Object.freeze([
    "The Imprint study is coming to a close. Thank you for being part of it.",
    "Before we wrap up, we'd love to hear about your experience. The exit questionnaire is optional and takes a few minutes. Your answers help us understand what worked and what didn't.",
  ]),
  button: "Answer the questionnaire",
  bell: Object.freeze({
    title: "Tell us about your experience",
    activity: "The optional exit questionnaire takes a few minutes.",
    href: EXIT_QUESTIONNAIRE_PATH,
  }),
});

const USER_FIELDS = { _id: 1, username: 1, email: 1, emailVerifiedAt: 1, createdAt: 1, isPilot: 1, emailOptOutAt: 1 };

/** Every contributor account: `role` "user" or missing. Annotators and admins are never read. */
function contributorAccounts(db) {
  return db.collection("users").find({ role: { $in: ["user", null] } }, { projection: USER_FIELDS }).toArray();
}

/**
 * The sends of some campaigns: campaign id, then user id, to `{ status, at }`.
 * A claim left "sending" for long counts as failed, as in sortAudience. `at`
 * is when the email went (or was claimed, for one going out now).
 */
async function sendsByCampaign(db, campaignIds, now) {
  const out = new Map(campaignIds.map((id) => [id, new Map()]));
  const rows = await db
    .collection("email_sends")
    .find({ campaign: { $in: campaignIds } }, { projection: { campaign: 1, userId: 1, status: 1, claimedAt: 1, sentAt: 1 } })
    .toArray();
  for (const s of rows) {
    const stale = s.status === "sending" && now.getTime() - new Date(s.claimedAt).getTime() > STALE_CLAIM_MS;
    const at = new Date(s.sentAt ?? s.claimedAt).getTime();
    out.get(s.campaign)?.set(idText(s.userId), { status: stale ? "failed" : s.status, at: Number.isNaN(at) ? null : at });
  }
  return out;
}

/**
 * Each person's latest finished photo, as a time: a completed annotation that
 * is not an annotator's. A person is in the map once they have one, with
 * `null` when none of theirs has a usable date.
 */
async function latestPhotoTimes(db) {
  const latest = new Map();
  const rows = await db
    .collection("annotations")
    .find({ status: "completed", source: { $ne: "annotator" } }, { projection: { userId: 1, date: 1 } })
    .toArray();
  for (const a of rows) {
    const id = idText(a.userId);
    const t = a.date == null ? NaN : new Date(a.date).getTime();
    const kept = latest.get(id);
    if (Number.isNaN(t)) {
      if (kept === undefined) latest.set(id, null);
    } else if (kept == null || t > kept) latest.set(id, t);
  }
  return latest;
}

const BASE_REASONS = ["noEmail", "pilot", "optedOut"];
const SEND_REASONS = ["alreadySent", "failedBefore"];

/**
 * Sorts contributors for one of the S33 campaigns: the reasons every campaign
 * shares (no address, a pilot, opted out, already sent), then the campaign's
 * own `reasonFor(user, id)`, then a failed earlier send last, so `failed`
 * holds only people who would be in the audience now.
 */
function sortContributors(users, sent, ownReasons, reasonFor) {
  const excluded = Object.fromEntries([...BASE_REASONS, ...ownReasons, ...SEND_REASONS].map((r) => [r, 0]));
  const eligible = [];
  const failed = [];
  for (const user of users) {
    const id = idText(user._id);
    const status = sent.get(id)?.status;
    let reason = null;
    if (!user.email) reason = "noEmail";
    else if (user.isPilot) reason = "pilot";
    else if (user.emailOptOutAt) reason = "optedOut";
    else if (status && status !== "failed") reason = "alreadySent";
    else reason = reasonFor(user, id) || (status === "failed" ? "failedBefore" : null);

    if (reason) excluded[reason] += 1;
    if (reason === "failedBefore") failed.push(user);
    if (!reason) eligible.push(user);
  }
  return { eligible, excluded, failed };
}

/** What the new campaigns share: one version of the words, and `audience` as the ids `sort` lets through. */
function eventCampaign({ id, family = null, copy, actionPath, sort, ...rest }) {
  return Object.freeze({
    id,
    family,
    variants: ONE_VARIANT_LIST,
    variant: () => ONE_VARIANT,
    actionPath: () => actionPath,
    sort,
    async audience(db, now = new Date()) {
      return (await sort(db, now)).eligible.map((u) => u._id);
    },
    message: (user, variant, links) => renderMessage(user, links, copy),
    ...rest,
  });
}

/** The highest milestone the count has reached, or null below the first. */
export function milestoneDue(count, milestones = MILESTONES) {
  const reached = milestones.filter((m) => count >= m);
  return reached.length ? Math.max(...reached) : null;
}

/**
 * A community milestone. It goes to contributors with a finished photo of
 * their own, and only while it is the highest milestone reached: one the
 * count passed without it being sent is never sent afterwards. `info` says
 * the count it read and whether this milestone is the one due.
 */
function milestoneCampaign(milestone, next) {
  const id = `milestone-${milestone}`;
  return eventCampaign({
    id,
    family: "milestone",
    milestone,
    copy: milestoneCopy(milestone, next),
    actionPath: "/contribute",
    async sort(db, now = new Date()) {
      const photos = await publicPhotoCount(db);
      const due = milestoneDue(photos) === milestone;
      if (!due) {
        const none = sortContributors([], new Map(), ["noPhoto"], () => null);
        return { ...none, info: { photos, due } };
      }
      const [users, sends, latest] = await Promise.all([contributorAccounts(db), sendsByCampaign(db, [id], now), latestPhotoTimes(db)]);
      const sorted = sortContributors(users, sends.get(id), ["noPhoto"], (user, userId) => (latest.has(userId) ? null : "noPhoto"));
      return { ...sorted, info: { photos, due } };
    },
  });
}

const inactivityId = (round) => `inactivity-${round}`;
const INACTIVITY_IDS = Object.freeze(Array.from({ length: INACTIVITY_ROUNDS }, (_, i) => inactivityId(i + 1)));

/**
 * Round `round` of the inactivity reminder: to a contributor whose latest
 * finished photo is at least 5 days old, who has had exactly the rounds
 * before this one, and (after the first) who finished a photo since the
 * previous reminder. So one quiet spell is one email, and nobody has more
 * than three.
 *
 * Left out as: `noPhoto` (welcome-nudge is theirs), `otherRound` (an earlier
 * round has not gone to them), `active` (a photo in the last 5 days),
 * `notBack` (no photo since the previous reminder).
 */
function inactivityCampaign(round) {
  const id = inactivityId(round);
  return eventCampaign({
    id,
    family: "inactivity",
    round,
    // The animation, as welcome-nudge has it, after the "A session of 5
    // photos..." paragraph and before the button (Rans, 18 Nov 2026)
    copy: { ...INACTIVITY_COPY, animation: true },
    actionPath: "/contribute",
    async sort(db, now = new Date()) {
      const [users, sends, latest] = await Promise.all([contributorAccounts(db), sendsByCampaign(db, INACTIVITY_IDS, now), latestPhotoTimes(db)]);
      const quietSince = now.getTime() - INACTIVE_AFTER_MS;
      return sortContributors(users, sends.get(id), ["noPhoto", "otherRound", "active", "notBack"], (user, userId) => {
        const last = latest.get(userId);
        if (last == null) return "noPhoto";
        let previous = null;
        for (let r = 1; r < round; r++) {
          previous = sends.get(inactivityId(r)).get(userId);
          if (!previous || previous.status === "failed") return "otherRound";
        }
        if (last > quietSince) return "active";
        if (previous && !(previous.at !== null && last > previous.at)) return "notBack";
        return null;
      });
    },
  });
}

/**
 * The exit questionnaire invitation: to every contributor account, with or
 * without a photo and whatever its age. Sent by Rans by hand at the close of
 * the study, never by the daily task (`manualOnly`, which the sender obeys
 * whatever CAMPAIGN_AUTOSEND says).
 */
export const exitQuestionnaire = eventCampaign({
  id: EXIT_QUESTIONNAIRE_ID,
  manualOnly: true,
  copy: EXIT_QUESTIONNAIRE_COPY,
  actionPath: EXIT_QUESTIONNAIRE_PATH,
  async sort(db, now = new Date()) {
    const [users, sends] = await Promise.all([contributorAccounts(db), sendsByCampaign(db, [EXIT_QUESTIONNAIRE_ID], now)]);
    return sortContributors(users, sends.get(EXIT_QUESTIONNAIRE_ID), [], () => null);
  },
});

export const milestoneCampaigns = Object.freeze(MILESTONES.map((m, i) => milestoneCampaign(m, MILESTONES[i + 1] ?? null)));
export const inactivityCampaigns = Object.freeze(INACTIVITY_IDS.map((_, i) => inactivityCampaign(i + 1)));

export const CAMPAIGNS = Object.freeze(
  Object.fromEntries([welcomeNudge, ...milestoneCampaigns, ...inactivityCampaigns, exitQuestionnaire].map((c) => [c.id, c])),
);

/**
 * A family is a kind of email sent in rounds, named as one in
 * CAMPAIGN_AUTOSEND, in a dry run and in a preview. `preview` is what a
 * preview of the family sends: the first milestone (with its next goal) and
 * the last (with none), and one inactivity reminder, since its rounds read
 * the same.
 */
export const FAMILIES = Object.freeze({
  milestone: Object.freeze({ members: milestoneCampaigns, preview: Object.freeze([milestoneCampaigns[0], milestoneCampaigns.at(-1)]) }),
  inactivity: Object.freeze({ members: inactivityCampaigns, preview: Object.freeze([inactivityCampaigns[0]]) }),
});

/** The order of one daily run (`campaign: "all"`). The exit questionnaire is never in it. */
export const AUTO_ORDER = Object.freeze([welcomeNudge, ...milestoneCampaigns, ...inactivityCampaigns]);

const own = (object, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(object, key);

export function findCampaign(id) {
  return own(CAMPAIGNS, id) ? CAMPAIGNS[id] : null;
}

/** A family by its name, or null. */
export function findFamily(name) {
  return own(FAMILIES, name) ? FAMILIES[name] : null;
}
