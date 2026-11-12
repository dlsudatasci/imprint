import nodemailer from "nodemailer";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { readRetrainingProgress } from "@/util/retrainingProgress";

/**
 * The email sent when a retraining cycle is ready (S26, 12 Nov 2026).
 *
 * Called when a contributor's session ends (`annotationComplete` and
 * `annotationAbandon`), after the session and its answers are saved. It reads
 * the same counts as the admin Retraining tab and, the first time the
 * contributor judgments reach the next cycle's target, sends one email to
 * RETRAINING_NOTIFY_EMAIL. Counts only: no usernames, emails, ids or rows.
 *
 * One email per target: the target is claimed in one atomic update of the
 * `settings` document `retrainingNotice` before sending, so two sessions
 * ending at the same moment send one email. A failed send gives the target
 * back, so the next session's end tries again.
 */

/** The `settings` document that holds the targets already emailed. */
export const RETRAINING_NOTICE_ID = "retrainingNotice";

const formatCount = (n) => Number(n).toLocaleString("en-US");

/**
 * The message for `to`, from the counts the Retraining tab shows. Pure, so
 * tests can read every word: no em dashes and no semicolons.
 */
export function buildRetrainingReadyMail({
  to,
  progress,
  baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000",
  from = process.env.EMAIL_USER || "no-reply@imprint.com",
}) {
  const cycle = progress.retrainingCyclesRun + 1;
  const target = formatCount(progress.nextRetrainingAt);
  const origin = String(baseUrl).replace(/\/+$/, "");
  return {
    from: `"Imprint Support" <${from}>`,
    to,
    subject: `Imprint: retraining cycle ${cycle} is ready`,
    text: [
      `Contributors have reached ${formatCount(progress.contributorJudgments)} usable judgments, and cycle ${cycle} starts at ${target}.`,
      `They come from ${formatCount(progress.contributorAnnotations)} contributor annotations. Contributors flagged by quality control are removed later, at the cycle.`,
      `The cycle takes the first ${target} judgments by time, so it can run in the next few days without changing what goes in.`,
      `Retraining tab: ${origin}/admin`,
    ].join("\n"),
  };
}

/** Sends with the same settings as the other emails (EMAIL_SERVICE, EMAIL_USER, EMAIL_PASS). */
async function sendWithNodemailer(mail) {
  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  await transporter.sendMail(mail);
}

/**
 * Sends the email when the next cycle's target is reached and has not been
 * emailed yet. Returns what it did, `{ sent, reason, target }`, for tests and
 * logs. A failed send is logged and not thrown on. A failed read or claim does
 * throw, so callers wrap it in their own try/catch.
 *
 * @param {import("mongodb").Db} db
 * @param {{ send?: (mail: object) => Promise<unknown> }} [options] `send` is
 *   passed in by tests, so no test ever sends a real email.
 */
export async function notifyRetrainingReady(db, { send = sendWithNodemailer } = {}) {
  const to = (process.env.RETRAINING_NOTIFY_EMAIL || "").trim();
  // Nothing counted or claimed, so setting it later still sends the email for
  // a target already reached
  if (!to) return { sent: false, reason: "no-address" };

  const progress = await readRetrainingProgress(db);
  const target = progress.nextRetrainingAt;
  if (progress.judgmentsUntilNext !== 0) return { sent: false, reason: "not-ready", target };

  const settings = db.collection("settings");
  let claim;
  try {
    claim = await settings.updateOne(
      { _id: RETRAINING_NOTICE_ID },
      { $addToSet: { notifiedTargets: target } },
      { upsert: true },
    );
  } catch (err) {
    // Two first-ever claims at once: the other one created the document
    if (err?.code === 11000) return { sent: false, reason: "already-notified", target };
    throw err;
  }
  if (claim.upsertedCount !== 1 && claim.modifiedCount !== 1) {
    return { sent: false, reason: "already-notified", target };
  }

  try {
    await send(buildRetrainingReadyMail({ to, progress }));
  } catch (err) {
    console.error(`[Retraining notice] The email for ${target} judgments could not be sent, the next session end tries again:`, err);
    try {
      await settings.updateOne({ _id: RETRAINING_NOTICE_ID }, { $pull: { notifiedTargets: target } });
    } catch (releaseErr) {
      console.error(`[Retraining notice] Could not release ${target}, no email will come for it until it is removed from settings.${RETRAINING_NOTICE_ID}:`, releaseErr);
    }
    return { sent: false, reason: "send-failed", target };
  }

  // When each target was reached, on record. Counts only, no user fields.
  await logTelemetryEvent({
    event: "RETRAINING_READY",
    target,
    contributorJudgments: progress.contributorJudgments,
    contributorAnnotations: progress.contributorAnnotations,
    cycle: progress.retrainingCyclesRun + 1,
  });
  return { sent: true, target };
}
