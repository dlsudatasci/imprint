import { unsubscribeUrl, oneClickUnsubscribeUrl } from "../emailLinks.mjs";
import { findCampaign, findFamily, idText, AUTO_ORDER, CAMPAIGNS, STALE_CLAIM_MS } from "./campaigns.mjs";

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
 *   campaign named in CAMPAIGN_AUTOSEND, and for `welcome-nudge` only after
 *   a manual send.
 *
 * `campaign` (S33, 17 Nov 2026) is a campaign id, a family name
 * ("milestone", "inactivity": its rounds) or "all":
 * - `preview` takes an id or a family (the family's chosen examples).
 * - `apply` and `retry-failed` take one id.
 * - `dry` and `auto` take any of the three. "all" is every campaign
 *   CAMPAIGN_AUTOSEND names, by id or by family, in the order welcome-nudge,
 *   the milestones, the inactivity rounds, within one `limit` for the run.
 * - `exit-questionnaire` is never sent by `auto`, whatever the setting says.
 *
 * One campaign email per person per day: in `auto`, and in a dry run of
 * several, anyone with a send whose `sentAt` is in the last 20 hours, of any
 * campaign, is left out of the run and counted as `sentToday`. Nothing is
 * queued, a later run takes them if they still qualify. A manual `apply` is
 * not held back, and its sends count for the next automatic run. A campaign
 * marked `holdSameDay` (the leaderboard announcement, 18 Nov 2026) is held
 * back the same way in `apply`, `retry-failed` and `dry` too.
 *
 * 20 hours, not 24 (Rans, 18 Nov 2026): the daily task runs at the same time
 * each day and its emails go out a moment after the run begins, so the next
 * day's run starts just under 24 hours after them. A 24-hour window held
 * those people back for a second day. 20 hours still allows one a day.
 *
 * One send per person and campaign: the unique index on `{ campaign, userId }`
 * makes a second claim fail with a duplicate key, so two runs at once, or a
 * run repeated, never send twice.
 *
 * Never returns or logs an address, a username or an id, in any mode.
 */

export const MODES = Object.freeze(["preview", "dry", "apply", "retry-failed", "auto"]);
export const ALL = "all";
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const DEFAULT_PAUSE_MS = 1500;
export const REQUIRED_SETTINGS = Object.freeze(["EMAIL_USER", "EMAIL_PASS", "NEXTAUTH_URL", "NEXTAUTH_SECRET"]);
export const SENDS_INDEX = Object.freeze({ keys: { campaign: 1, userId: 1 }, options: { unique: true, name: "uniq_campaign_user" } });
export const FEED_LIMIT = 100;
export const SENT_EVENT = "CAMPAIGN_EMAIL_SENT";
/**
 * Someone sent any campaign email this recently gets none from an automatic
 * run. Under a day, so yesterday's run never holds back today's (see above).
 */
export const ONE_A_DAY_MS = 20 * 60 * 60 * 1000;

export const SEND_BY_HAND_FIRST = "Send this campaign by hand first.";
export const BY_HAND_ONLY = "This campaign is sent by hand only, never by auto.";
export const ONE_CAMPAIGN_ONLY = "apply and retry-failed take one campaign id.";
export const PREVIEW_NOT_ALL = "A preview takes a campaign id or a family name.";

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
 * What `campaign` names: `{ kind: "one" | "family" | "all", campaigns,
 * preview }`, or null. "all" is settled later, from CAMPAIGN_AUTOSEND.
 */
function resolveTarget(name) {
  if (name === ALL) return { kind: "all", campaigns: [], preview: [] };
  const one = findCampaign(name);
  if (one) return { kind: "one", campaigns: [one], preview: [one] };
  const family = findFamily(name);
  if (family) return { kind: "family", campaigns: family.members, preview: family.preview };
  return null;
}

/** Whether CAMPAIGN_AUTOSEND names a campaign, by its id or its family. */
const namedIn = (names, campaign) => names.includes(campaign.id) || (!!campaign.family && names.includes(campaign.family));

/**
 * Why `auto` does not send a campaign, or null when it may: `{ error }` is a
 * refusal, `{ message }` says the setting does not name it.
 */
async function autoGate(campaign, names, sends) {
  if (campaign.manualOnly) return { error: BY_HAND_ONLY };
  if (!namedIn(names, campaign)) return { message: `CAMPAIGN_AUTOSEND does not name ${campaign.id}, so nothing was sent.` };
  if (campaign.manualFirst) {
    const manual = await sends.findOne({ campaign: campaign.id, trigger: "manual", status: "sent" }, { projection: { _id: 1 } });
    if (!manual) return { error: SEND_BY_HAND_FIRST };
  }
  return null;
}

/** The ids of everyone sent a campaign email in the last 20 hours (ONE_A_DAY_MS). */
async function sentInLastDay(sends, at) {
  const rows = await sends.find({ sentAt: { $gte: new Date(at.getTime() - ONE_A_DAY_MS) } }, { projection: { userId: 1 } }).toArray();
  return new Set(rows.map((r) => idText(r.userId)));
}

/** A dry run's counts for one campaign. `held` (or null) is who has had an email today. */
function dryCounts(campaign, sorted, limit, held) {
  const pool = held ? sorted.eligible.filter((u) => !held.has(idText(u._id))) : sorted.eligible;
  const byVariant = Object.fromEntries(campaign.variants.map((v) => [v, 0]));
  for (const user of pool) byVariant[campaign.variant(user)] += 1;
  const would = pool.slice(0, limit);
  return {
    counts: {
      audience: pool.length,
      byVariant,
      excluded: sorted.excluded,
      ...(held ? { sentToday: sorted.eligible.length - pool.length } : {}),
      wouldSendThisRun: would.length,
      ...(sorted.info || {}),
    },
    would,
  };
}

/**
 * @param {object} options
 * @param {import("mongodb").Db} options.db
 * @param {{ sendMail: (mail: object) => Promise<unknown> }} options.transport
 * @param {string} options.campaign  a campaign id, a family name or "all"
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
  campaign: campaignName,
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

  const target = resolveTarget(campaignName);
  if (!target) return { ok: false, error: "No campaign with that id." };
  if (!MODES.includes(mode)) return { ok: false, error: `mode must be one of: ${MODES.join(", ")}.` };

  const runLimit = wholeNumber(limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  if (runLimit === null) return { ok: false, error: `limit must be a whole number from 1 to ${MAX_LIMIT}.` };
  const pause = wholeNumber(pauseMs, DEFAULT_PAUSE_MS, 0, 60000);
  if (pause === null) return { ok: false, error: "pauseMs must be a whole number from 0 to 60000." };

  const base = { ok: true, campaign: campaignName, mode };

  if (mode === "preview") {
    if (target.kind === "all") return { ok: false, error: PREVIEW_NOT_ALL };
    return preview({ db, transport, campaigns: target.preview, previewTo, env, base, now });
  }
  if ((mode === "apply" || mode === "retry-failed") && target.kind !== "one") return { ok: false, error: ONE_CAMPAIGN_ONLY };

  const sends = db.collection("email_sends");
  const names = autosendCampaigns(env.CAMPAIGN_AUTOSEND);
  const at = now();
  const trigger = mode === "auto" ? "auto" : "manual";
  const run = { db, transport, sends, mode, trigger, pause, env, now, sleep };

  if (target.kind === "one") {
    const campaign = target.campaigns[0];
    if (mode === "auto") {
      const gate = await autoGate(campaign, names, sends);
      if (gate?.error) return { ok: false, error: gate.error };
      if (gate) return { ...base, sent: 0, message: gate.message };
    }
    const sorted = await campaign.sort(db, at);
    // Who has had an email in the last 20 hours: always for auto, and in
    // every mode for a campaign marked holdSameDay
    const holds = mode === "auto" || campaign.holdSameDay === true;
    if (mode === "dry") {
      const dryHeld = holds ? await sentInLastDay(sends, at) : null;
      return { ...base, ...dryCounts(campaign, sorted, runLimit, dryHeld).counts, limit: runLimit };
    }

    // The production image has no scripts/, so the sender makes sure the
    // index is there before its first send. Does nothing when it exists.
    await sends.createIndex(SENDS_INDEX.keys, SENDS_INDEX.options);
    const held = holds ? await sentInLastDay(sends, at) : null;
    const { counts } = await runCampaign({ ...run, campaign, sorted, limit: runLimit, held });
    return { ...base, ...counts, limit: runLimit };
  }

  // Several campaigns in one run (a family or "all"), `dry` or `auto`: one
  // limit for the run, and nobody is sent two of them
  const everything = target.kind === "all";
  const campaigns = everything ? AUTO_ORDER.filter((c) => namedIn(names, c)) : target.campaigns;
  const rows = [];
  if (everything) {
    // Named by mistake: said in the counts, and never sent
    for (const c of Object.values(CAMPAIGNS)) if (c.manualOnly && namedIn(names, c)) rows.push({ campaign: c.id, ok: false, error: BY_HAND_ONLY });
  }

  const held = await sentInLastDay(sends, at);
  let remaining = runLimit;
  let indexed = false;
  const total = { sent: 0, failed: 0, skipped: 0, notRecorded: 0 };
  for (const campaign of campaigns) {
    const gate = everything || mode === "auto" ? await autoGate(campaign, names, sends) : null;
    if (gate) {
      rows.push({ campaign: campaign.id, ...(gate.error ? { ok: false, error: gate.error } : { sent: 0, message: gate.message }) });
      continue;
    }
    const sorted = await campaign.sort(db, now());
    if (mode === "dry") {
      const { counts, would } = dryCounts(campaign, sorted, remaining, held);
      for (const user of would) held.add(idText(user._id));
      remaining -= would.length;
      rows.push({ campaign: campaign.id, ...counts });
      continue;
    }
    if (!indexed) {
      await sends.createIndex(SENDS_INDEX.keys, SENDS_INDEX.options);
      indexed = true;
    }
    const { counts, tried } = await runCampaign({ ...run, campaign, sorted, limit: remaining, held, pauseFirst: remaining < runLimit });
    remaining -= tried;
    for (const key of Object.keys(total)) total[key] += counts[key];
    rows.push({ campaign: campaign.id, ...counts });
  }

  if (mode === "dry") return { ...base, limit: runLimit, wouldSendThisRun: runLimit - remaining, campaigns: rows };
  return {
    ...base,
    trigger,
    ...total,
    limit: runLimit,
    ...(everything && campaigns.length === 0 ? { message: "CAMPAIGN_AUTOSEND names no campaign that auto sends, so nothing was sent." } : {}),
    campaigns: rows,
  };
}

/**
 * Sends one campaign to up to `limit` people of `sorted` (its `sort`), and
 * answers `{ counts, tried }`: the counts for the reply, and how many of the
 * run's limit it used. `held` is who has had a campaign email today: they are
 * left out and counted, and everyone sent here is added to it.
 */
async function runCampaign({ db, transport, sends, campaign, sorted, mode, trigger, limit, pause, held = null, pauseFirst = false, env, now, sleep }) {
  const { eligible, excluded, failed } = sorted;
  const retrying = mode === "retry-failed";
  const everyone = retrying ? failed : eligible;
  const pool = held ? everyone.filter((u) => !held.has(idText(u._id))) : everyone;
  const batch = pool.slice(0, limit);
  const counts = { sent: 0, failed: 0, skipped: 0, notRecorded: 0 };

  // After another campaign's sends in the same run, the pause comes first
  if (pauseFirst && batch.length > 0 && pause > 0) await sleep(pause);

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
    held?.add(userId);
    try {
      await sends.updateOne({ campaign: campaign.id, userId }, { $set: { status: "sent", sentAt }, $unset: { error: "", failedAt: "" } });
      await db.collection("users").updateOne(
        { _id: user._id },
        {
          $push: {
            activities: {
              $each: [bellEntry(bell, campaign, sentAt)],
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
  return {
    tried: batch.length,
    counts: {
      trigger,
      ...counts,
      left,
      ...(held ? { sentToday: everyone.length - pool.length } : {}),
      ...(retrying ? {} : { excluded }),
      ...(sorted.info || {}),
    },
  };
}

/** The bell's feed entry for a campaign email. `href` (S33) is the page it opens, when it has one. */
function bellEntry(bell, campaign, date, titlePrefix = "") {
  return {
    tag: "message",
    title: `${titlePrefix}${bell.title}`,
    activity: bell.activity,
    date,
    campaign: campaign.id,
    ...(bell.href ? { href: bell.href } : {}),
  };
}

async function preview({ db, transport, campaigns, previewTo, env, base, now }) {
  const refuse = { ok: false, error: "A preview goes only to an admin account. Give previewTo as an admin's username." };
  if (typeof previewTo !== "string" || !previewTo.trim()) return refuse;
  const admin = await db
    .collection("users")
    .findOne({ username: previewTo.trim() }, { projection: { _id: 1, username: 1, email: 1, role: 1, emailVerifiedAt: 1 } });
  if (!admin || admin.role !== "admin" || !admin.email) return refuse;

  // Every audience rule is ignored: a preview works whatever the photo count
  // or the date
  let previewSent = 0;
  const bells = [];
  for (const campaign of campaigns) {
    for (const variant of campaign.variants) {
      const { mail, bell } = buildCampaignMail(campaign, admin, variant, env, { preview: true });
      await transport.sendMail(mail);
      previewSent += 1;
      bells.push({ bell, campaign });
    }
  }

  // The bell messages too, to the same admin only, so the tray and its dot
  // can be checked with the emails. No send record and no telemetry event:
  // a preview is never part of the campaign.
  const at = now();
  const entries = bells.map(({ bell, campaign }) => bellEntry(bell, campaign, at, "[Preview] "));
  await db.collection("users").updateOne(
    { _id: admin._id },
    { $push: { activities: { $each: entries, $slice: -FEED_LIMIT } } },
  );
  return { ...base, previewSent, previewBell: entries.length };
}
