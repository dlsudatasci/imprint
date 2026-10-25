import { connectToDatabase } from "@/util/mongodb";
import {
  normalizeEmail,
  checkVerifyLink,
  EMAIL_ACTIVITY,
  EMAIL_ACTIVITY_TAG,
  LINK_INVALID,
  LINK_USED,
  VERIFY_LINK_MESSAGES,
} from "@/util/validators/emailVerification.mjs";
import { hashVerifyToken } from "@/util/verificationEmail";

/**
 * POST /api/auth/verify-email { email, token } — confirms an address (S9).
 *
 * The emailed link opens /verify-email, and that page posts here. A GET on the
 * link changes nothing, so a mail scanner that opens links does not use it up.
 *
 * Hashes the token and compares it with the stored hash and expiry
 * (checkVerifyLink). On success it sets emailVerifiedAt, clears the token so the
 * link works once, and adds "Confirmed your email" to the activity feed, keeping
 * the newest 100 like every other entry. The update matches the token too, so
 * two clicks at once confirm once.
 *
 * Answers: 200 confirmed, 400 { code: "invalid" | "expired" }, 409 { code:
 * "used" } when the address is already confirmed. Unlike the password reset
 * these are told apart, so the page can say what to do next. That reveals no
 * more than registering does, which already says whether an address is taken.
 */
const handler = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const email = normalizeEmail(req.body?.email);
  const { token } = req.body || {};

  // Both go into a query or a hash, so both must be strings
  if (typeof email !== "string" || !email || typeof token !== "string" || !token) {
    return res.status(400).json({ message: VERIFY_LINK_MESSAGES.missing, code: LINK_INVALID });
  }

  try {
    const { db } = await connectToDatabase();
    const user = await db.collection("users").findOne(
      { email },
      { projection: { emailVerifiedAt: 1, emailVerifyToken: 1, emailVerifyExpire: 1 } }
    );

    const hashedToken = hashVerifyToken(token);
    const now = new Date();
    const check = checkVerifyLink(user, hashedToken, now);
    if (!check.ok) {
      const status = check.code === LINK_USED ? 409 : 400;
      return res.status(status).json({ message: VERIFY_LINK_MESSAGES[check.code], code: check.code });
    }

    const result = await db.collection("users").updateOne(
      { _id: user._id, emailVerifyToken: hashedToken },
      {
        $set: { emailVerifiedAt: now, updatedAt: now },
        $unset: { emailVerifyToken: "", emailVerifyExpire: "", emailVerifySentAt: "" },
        $push: {
          activities: {
            $each: [{ activity: EMAIL_ACTIVITY, date: now, tag: EMAIL_ACTIVITY_TAG }],
            $slice: -100,
          },
        },
      }
    );

    // Another request used the link between the read and the write
    if (!result || result.modifiedCount === 0) {
      return res.status(409).json({ message: VERIFY_LINK_MESSAGES.used, code: LINK_USED });
    }

    return res.status(200).json({ message: VERIFY_LINK_MESSAGES.ok, verified: true });
  } catch (error) {
    console.error("Verify Email Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export default handler;
