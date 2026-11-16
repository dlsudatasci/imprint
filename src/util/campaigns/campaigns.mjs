import { FIRST_SESSION } from "../../features/annotate/firstSession.mjs";

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
 * first campaign's words"). No em dashes and no semicolons, checked by
 * campaigns.test.js.
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

const SIGN_OFF = ["Thank you for being part of this!", "Francis Bawa, Imprint"];
const FOOTER = "You're getting this because you signed up for Imprint. Don't want emails like this?";
const STOP = "Stop these emails";

const firstSessionLine = `You can start with just ${FIRST_SESSION.photos} photos, which takes about ${FIRST_SESSION.minutes} minutes.`;
const whatYouDo = "You look at street photos from Metro Manila and tell us what gets in your way on the sidewalk.";

/**
 * The words of `welcome-nudge`, per variant. `paragraphs` are the body before
 * the animation, `after` the body after it and before the button.
 */
export const WELCOME_NUDGE_COPY = Object.freeze({
  start: Object.freeze({
    subject: "Your first sidewalk is waiting on Imprint",
    paragraphs: [
      "Thanks for signing up on Imprint. We noticed you haven't started a session yet, so this is a friendly nudge.",
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
      "Sign in and click Resend to get a new confirmation link, since the first one only lasts a day. Then you're all set.",
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

const p = (text) => `<p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 16px">${escapeHtml(text)}</p>`;

/**
 * The email for one person. `links` is `{ origin, action, unsubscribe,
 * oneClick }`: the site without a trailing slash, the button's address, the
 * stop page and the one-click address for the List-Unsubscribe header.
 */
function welcomeNudgeMessage(user, variant, links) {
  const c = WELCOME_NUDGE_COPY[variant];
  if (!c) throw new Error(`welcome-nudge has no variant "${variant}"`);
  const hello = greeting(user?.username);

  const text = [
    hello,
    "",
    ...c.paragraphs.flatMap((x) => [x, ""]),
    ...c.after.flatMap((x) => [x, ""]),
    `${c.button}: ${links.action}`,
    "",
    ...SIGN_OFF,
    "",
    `${FOOTER} ${STOP}: ${links.unsubscribe}`,
  ].join("\n");

  const action = escapeHtml(links.action);
  const stop = escapeHtml(links.unsubscribe);
  const origin = escapeHtml(links.origin);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px 16px;background:#ffffff">
${p(hello)}
${c.paragraphs.map(p).join("\n")}
<a href="${origin}/contribute" style="display:block;margin:0 0 16px"><img src="${origin}${ANIMATION_PATH}" width="600" alt="${escapeHtml(ANIMATION_ALT)}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a>
${c.after.map(p).join("\n")}
<div style="text-align:center;margin:24px 0 8px"><a href="${action}" style="background-color:#004aad;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">${escapeHtml(c.button)}</a></div>
<p style="color:#64748b;font-size:12px;text-align:center;margin:0 0 24px"><a href="${action}" style="color:#004aad;word-break:break-all">${action}</a></p>
<p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 24px">${SIGN_OFF.map(escapeHtml).join("<br>")}</p>
<hr style="border:0;border-top:1px solid #e2e8f0;margin:0 0 16px">
<p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0">${escapeHtml(FOOTER)} <a href="${stop}" style="color:#64748b">${STOP}</a></p>
</div>`;

  return {
    email: { subject: c.subject, text, html },
    bell: { title: c.bell.title, activity: c.bell.activity },
  };
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

export const CAMPAIGNS = Object.freeze({ [welcomeNudge.id]: welcomeNudge });

export function findCampaign(id) {
  return Object.prototype.hasOwnProperty.call(CAMPAIGNS, id) ? CAMPAIGNS[id] : null;
}
