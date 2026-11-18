import nodemailer from "nodemailer";
import { connectToDatabase } from "@/util/mongodb";
import { sendCampaign } from "@/util/campaigns/sendCampaign.mjs";
import { campaignRouteAllowed } from "@/util/campaigns/internalAccess.mjs";

/**
 * POST /api/internal/campaigns (S29, 16 Nov 2026): runs a participant email
 * campaign. Body `{ campaign, mode, previewTo?, limit?, pauseMs? }`, answered
 * with the sender's counts as JSON (src/util/campaigns/sendCampaign.mjs).
 *
 * Rans calls it from the app's terminal in Coolify, and the daily scheduled
 * task calls it with `mode: "auto"`, both with one `node -e` line that posts
 * to http://127.0.0.1:3000 (the S29 spec, "Running it on Coolify"). It works
 * only from inside the container and with CAMPAIGN_SECRET
 * (internalAccess.mjs). Anything else is a 404.
 *
 * S33 (17 Nov 2026): `campaign` may also be a family name ("milestone",
 * "inactivity") or "all", which the daily task now posts with `mode: "auto"`.
 * The sender refuses `exit-questionnaire` in `auto`, whatever
 * CAMPAIGN_AUTOSEND says, so this route can never send it on its own.
 *
 * A run of 50 with the 1.5 s pause takes about two minutes, which the
 * standalone server allows.
 */

function notFound(res) {
  return res.status(404).json({ message: "Not Found" });
}

function mailTransport() {
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return notFound(res);
  if (!campaignRouteAllowed(req, process.env.CAMPAIGN_SECRET)) return notFound(res);

  const body = req.body && typeof req.body === "object" ? req.body : {};
  try {
    const { db } = await connectToDatabase();
    const result = await sendCampaign({
      db,
      transport: mailTransport(),
      campaign: body.campaign,
      mode: body.mode,
      previewTo: body.previewTo,
      limit: body.limit,
      pauseMs: body.pauseMs,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error("[Campaigns] The run stopped:", error?.name || "Error", error?.code ?? "");
    return res.status(500).json({ ok: false, error: "The run stopped. Check the app's log, then run dry to see where it stands." });
  }
}
