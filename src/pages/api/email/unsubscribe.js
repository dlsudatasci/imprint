import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/util/mongodb";
import { checkUnsubscribe } from "@/util/emailLinks.mjs";

/**
 * POST /api/email/unsubscribe (S29, 16 Nov 2026): stops, or restarts, the
 * campaign and event emails for one account, from the signed link in those
 * emails. No sign-in: the HMAC in the link is the proof.
 *
 * Two ways in:
 * - The /unsubscribe page sends JSON `{ u, t }`, or `{ u, t, on: true }` to
 *   turn the emails back on.
 * - A mail app's own Unsubscribe button (RFC 8058) posts the form field
 *   `List-Unsubscribe=One-Click` to the address in the List-Unsubscribe
 *   header, with `u` and `t` in the query.
 *
 * It sets or unsets `users.emailOptOutAt`. Account emails (confirmation,
 * password reset) never read that field. The answer holds no account
 * details, and no request limit applies here (deploy/nginx.conf limits only
 * the sign-in routes), so a valid link always works.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const u = typeof body.u === "string" ? body.u : req.query?.u;
  const t = typeof body.t === "string" ? body.t : req.query?.t;
  const turnOn = body.on === true;

  if (!checkUnsubscribe(u, t, process.env.NEXTAUTH_SECRET)) {
    return res.status(400).json({ message: "This link does not work." });
  }

  try {
    const { db } = await connectToDatabase();
    const update = turnOn ? { $unset: { emailOptOutAt: "" } } : { $set: { emailOptOutAt: new Date() } };
    await db.collection("users").updateOne({ _id: new ObjectId(u) }, update);
    return res.status(200).json({ ok: true, emailsOn: turnOn });
  } catch (error) {
    console.error("[Unsubscribe] Could not save the choice:", error?.name || "Error");
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
}
