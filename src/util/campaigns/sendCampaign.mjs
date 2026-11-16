import { unsubscribeUrl, oneClickUnsubscribeUrl } from "../emailLinks.mjs";
import { findCampaign, sortAudience, idText, STALE_CLAIM_MS } from "./campaigns.mjs";

/**
 * Sends a participant email campaign (S29, 16 Nov 2026). Plain Node: the
 * database and the mail transport are passed in, so tests inject fakes and
 * no test ever sends a real email. Called by POST /api/internal/campaigns,
 * which Rans reaches from the Coolify terminal and a Coolify scheduled task.
 *
 * Modes:
 * - `preview`: every variant to one admin account (`previewTo`, a username),
 *   subjects starting "[Preview] ", and each variant's bell message to that
 *   admin's feed, titles starting "[Preview] ". No send record, no event.
 * - `dry`: sends and writes nothing, answers counts only.
 * - `apply`: up to `limit` people, each claimed in `email_sends` before the
 *   email goes, then the bell message and a CAMPAIGN_EMAIL_SENT event.
 * - `retry-failed`: as apply, for this campaign's failed sends only.
 * - `auto`: as apply with `trigger: "auto"`, for the daily task. Only for a
 *   campaign named in CAMPAIGN_AUTOSEND that has had a manual send.
 *
 * One send per person and campaign: the unique index on `{ campaign, userId }`
 * makes a second claim fail with a duplicate key, so two runs at once, or a
 * run repeated, never send twice.
 *
 * Never returns or logs an address, a username or an id, in any mode.
 */

export const MODES = Object.freeze(["preview", "dry", "apply", "retry-failed", "auto"]);
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const DEFAULT_PAUSE_MS = 1500;
export const REQUIRED_SETTINGS = Object.freeze(["EMAIL_USER", "EMAIL_PASS", "NEXTAUTH_URL", "NEXTAUTH_SECRET"]);
export const SENDS_INDEX = Object.freeze({ keys: { campaign: 1, userId: 1 }, options: { unique: true, name: "uniq_campaign_user" } });
export const FEED_LIMIT = 100;
export const SENT_EVENT = "CAMPAIGN_EMAIL_SENT";

export const SEND_BY_HAND_FIRST = "Send this campaign by hand first.";

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The CAMPAIGN_AUTOSEND list. */
export function autosendCampaigns(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A short reason for a failed send, never the error's message (SMTP messages can hold the address). */
export function shortError(err) {
  if (err?.responseCode) return `SMTP ${err.responseCode}`;
  const code = typeof err?.code === "string" ? err.code : null;
  return String(code || err?.name || "Error").slice(0, 40);
}

function wholeNumber(value, fallback, min, max) {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/** The email and the bell entry for one person, with the stop link and headers. */
export function buildCampaignMail(campaign, user, variant, env, { preview = false } = {}) {
  const origin = String(env.NEXTAUTH_URL).replace(/\/+$/, "");
  const id = idText(user._id);
  const oneClick = oneClickUnsubscribeUrl(id, origin, env.NEXTAUTH_SECRET);
  const links = {
    origin,
    action: `${origin}${campaign.actionPath(variant)}`,
    unsubscribe: unsubscribeUrl(id, origin, env.NEXTAUTH_SECRET),
    oneClick,
  };
  const { email, bell } = campaign.message(user, variant, links);
  return {
    mail: {
      from: `"Imprint" <${env.EMAIL_USER}>`,
      to: user.email,
      subject: preview ? `[Preview] ${email.subject}` : email.subject,
      text: email.text,
      html: email.html,
      headers: {
        "List-Unsubscribe": `<${oneClick}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    },
    bell,
  };
}

/**
 * @param {object} options
 * @param {import("mongodb").Db} options.db
 * @param {{ sendMail: (mail: object) => Promise<unknown> }} options.transport
 * @param {string} options.campaign  a campaign id, for example "welcome-nudge"
 * @param {string} options.mode      one of MODES
 * @param {string} [options.previewTo] the admin's username, for `preview`
 * @param {number} [options.limit]   at most this many sends in this run (50)
 * @param {number} [options.pauseMs] the wait between two sends (1500)
 * @param {object} [options.env]     process.env, or a test's settings
 * @param {() => Date} [options.now]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @returns {Promise<object>} `{ ok: true, ...counts }` or `{ ok: false, error }`
 */
export async function sendCampaign({
  db,
  transport,
  campaign: campaignId,
  mode,
  previewTo,
  limit,
  pauseMs,
  env = process.env,
  now = () => new Date(),
  sleep = defaultSleep,
}) {
  const missing = REQUIRED_SETTINGS.filter((k) => !env[k]);
  if (missing.length) return { ok: false, error: `Missing settings: ${missing.join(", ")}.` };

  const campaign = findCampaign(campaignId);
  if (!campaign) return { ok: false, error: "No campaign with that id." };
  if (!MODES.includes(mode)) return { ok: false, error: `mode must be one of: ${MODES.join(", ")}.` };

  const runLimit = wholeNumber(limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  if (runLimit === null) return { ok: false, error: `limit must be a whole number from 1 to ${MAX_LIMIT}.` };
  const pause = wholeNumber(pauseMs, DEFAULT_PAUSE_MS, 0, 60000);
  if (pause === null) return { ok: false, error: "pauseMs must be a whole number from 0 to 60000." };

  const base = { ok: true, campaign: campaign.id, mode };

  if (mode === "preview") return preview({ db, transport, campaign, previewTo, env, base, now });

  const sends = db.collection("email_sends");

  if (mode === "auto") {
    if (!autosendCampaigns(env.CAMPAIGN_AUTOSEND).includes(campaign.id)) {
      return { ...base, sent: 0, message: `CAMPAIGN_AUTOSEND does not name ${campaign.id}, so nothing was sent.` };
    }
    const manual = await sends.findOne({ campaign: campaign.id, trigger: "manual", status: "sent" }, { projection: { _id: 1 } });
    if (!manual) return { ok: false, error: SEND_BY_HAND_FIRST };
  }

  const at = now();
  const { eligible, excluded, failed } = await sortAudience(db, campaign.id, at);

  if (mode === "dry") {
    const byVariant = Object.fromEntries(campaign.variants.map((v) => [v, 0]));
    for (const user of eligible) byVariant[campaign.variant(user)] += 1;
    return {
      ...base,
      audience: eligible.length,
      byVariant,
      excluded,
      wouldSendThisRun: Math.min(runLimit, eligible.length),
      limit: runLimit,
    };
  }

  // The production image has no scripts/, so the sender makes sure the
  // index is there before its first send. Does nothing when it exists.
  await sends.createIndex(SENDS_INDEX.keys, SENDS_INDEX.options);

  const retrying = mode === "retry-failed";
  const trigger = mode === "auto" ? "auto" : "manual";
  const pool = retrying ? failed : eligible;
  const batch = pool.slice(0, runLimit);
  const counts = { sent: 0, failed: 0, skipped: 0, notRecorded: 0 };

  for (let i = 0; i < batch.length; i++) {
    const user = batch[i];
    const userId = idText(user._id);
    const variant = campaign.variant(user);
    const claimedAt = now();

    // Claim first, so no other run can send to this person
    if (retrying) {
      const claimed = await sends.findOneAndUpdate(
        {
          campaign: campaign.id,
          userId,
          $or: [{ status: "failed" }, { status: "sending", claimedAt: { $lt: new Date(claimedAt.getTime() - STALE_CLAIM_MS) } }],
        },
        { $set: { status: "sending", claimedAt, variant } },
      );
      if (!claimed) {
        counts.skipped += 1;
        continue;
      }
    } else {
      try {
        await sends.insertOne({ campaign: campaign.id, userId, variant, trigger, status: "sending", claimedAt });
      } catch (err) {
        if (err?.code === 11000) {
          counts.skipped += 1;
          continue;
        }
        throw err;
      }
    }

    const { mail, bell } = buildCampaignMail(campaign, user, variant, env);
    try {
      await transport.sendMail(mail);
    } catch (err) {
      counts.failed += 1;
      await sends.updateOne(
        { campaign: campaign.id, userId },
        { $set: { status: "failed", error: shortError(err), failedAt: now() } },
      );
      if (i < batch.length - 1 && pause > 0) await sleep(pause);
      continue;
    }

    const sentAt = now();
    counts.sent += 1;
    try {
      await sends.updateOne({ campaign: campaign.id, userId }, { $set: { status: "sent", sentAt }, $unset: { error: "", failedAt: "" } });
      await db.collection("users").updateOne(
        { _id: user._id },
        {
          $push: {
            activities: {
              $each: [{ tag: "message", title: bell.title, activity: bell.activity, date: sentAt, campaign: campaign.id }],
              $slice: -FEED_LIMIT,
            },
          },
        },
      );
      await db.collection("telemetry_logs").insertOne({
        timestamp: sentAt,
        event: SENT_EVENT,
        campaign: campaign.id,
        variant,
        trigger,
        userId,
      });
    } catch (err) {
      // The email went, so it is counted as sent. What failed is only the
      // record of it, said in the counts and the log, without the person.
      counts.notRecorded += 1;
      console.error(`[Campaign ${campaign.id}] An email was sent but its record could not be written:`, shortError(err));
    }

    if (i < batch.length - 1 && pause > 0) await sleep(pause);
  }

  const left = pool.length - batch.length;
  console.log(`[Campaign ${campaign.id}] ${mode}: ${counts.sent} sent, ${counts.failed} failed, ${counts.skipped} skipped, ${left} left for a next run.`);
  return { ...base, trigger, ...counts, left, limit: runLimit, ...(retrying ? {} : { excluded }) };
}

async function preview({ db, transport, campaign, previewTo, env, base, now }) {
  const refuse = { ok: false, error: "A preview goes only to an admin account. Give previewTo as an admin's username." };
  if (typeof previewTo !== "string" || !previewTo.trim()) return refuse;
  const admin = await db
    .collection("users")
    .findOne({ username: previewTo.trim() }, { projection: { _id: 1, username: 1, email: 1, role: 1, emailVerifiedAt: 1 } });
  if (!admin || admin.role !== "admin" || !admin.email) return refuse;

  let previewSent = 0;
  const bells = [];
  for (const variant of campaign.variants) {
    const { mail, bell } = buildCampaignMail(campaign, admin, variant, env, { preview: true });
    await transport.sendMail(mail);
    previewSent += 1;
    bells.push(bell);
  }

  // The bell messages too, to the same admin only, so the tray and its dot
  // can be checked with the emails. No send record and no telemetry event:
  // a preview is never part of the campaign.
  const at = now();
  const entries = bells.map((bell) => ({
    tag: "message",
    title: `[Preview] ${bell.title}`,
    activity: bell.activity,
    date: at,
    campaign: campaign.id,
  }));
  await db.collection("users").updateOne(
    { _id: admin._id },
    { $push: { activities: { $each: entries, $slice: -FEED_LIMIT } } },
  );
  return { ...base, previewSent, previewBell: entries.length };
}
