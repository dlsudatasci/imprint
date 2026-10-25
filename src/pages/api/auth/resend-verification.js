import { getServerSession } from "next-auth/next";
import { ObjectId } from "mongodb";
import { authOptions } from "./[...nextauth]";
import { connectToDatabase } from "@/util/mongodb";
import {
  resendCutoff,
  resendWaitSeconds,
  verificationExpiry,
  RESEND_MESSAGES,
} from "@/util/validators/emailVerification.mjs";
import { createVerificationToken, sendVerificationEmail } from "@/util/verificationEmail";

/**
 * POST /api/auth/resend-verification — sends a new confirmation link (S9).
 *
 * Signed in only, for the person's own account. At most one mail per five
 * minutes per account (RESEND_INTERVAL_MS), plus the nginx limit on this path
 * (S8). The wait is enforced in the update itself: it only matches when the
 * last mail is older than the cutoff, so two clicks at once send one mail.
 *
 * A new link replaces the old one, so only the newest link works. If the mail
 * cannot be sent, the send time is cleared again so the person can retry at
 * once, and the answer is 502.
 *
 * Answers: 200 sent, 409 { code: "used" } already confirmed, 429 { retryAfter }
 * in seconds while the wait runs, 401 signed out, 404 no account.
 */
const handler = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session || !session.user?._id || !ObjectId.isValid(session.user._id)) {
      return res.status(401).json({ message: "Unauthorized. Please log in first." });
    }

    const { db } = await connectToDatabase();
    const _id = new ObjectId(session.user._id);
    const user = await db.collection("users").findOne(
      { _id },
      { projection: { email: 1, username: 1, emailVerifiedAt: 1, emailVerifySentAt: 1 } }
    );

    if (!user || typeof user.email !== "string") {
      return res.status(404).json({ message: "Account not found." });
    }
    if (user.emailVerifiedAt) {
      return res.status(409).json({ message: RESEND_MESSAGES.alreadyConfirmed, code: "used" });
    }

    const now = new Date();
    const { token, hashedToken } = createVerificationToken();
    const claimed = await db.collection("users").updateOne(
      {
        _id,
        // null also matches a missing field
        emailVerifiedAt: null,
        $or: [{ emailVerifySentAt: null }, { emailVerifySentAt: { $lte: resendCutoff(now) } }],
      },
      {
        $set: {
          emailVerifyToken: hashedToken,
          emailVerifyExpire: verificationExpiry(now),
          emailVerifySentAt: now,
          updatedAt: now,
        },
      }
    );

    if (!claimed || claimed.modifiedCount === 0) {
      // Read again: the wait, or a confirmation, may come from another request
      const latest = await db.collection("users").findOne(
        { _id },
        { projection: { emailVerifiedAt: 1, emailVerifySentAt: 1 } }
      );
      if (latest?.emailVerifiedAt) {
        return res.status(409).json({ message: RESEND_MESSAGES.alreadyConfirmed, code: "used" });
      }
      const retryAfter = Math.max(1, resendWaitSeconds(latest ?? user, now));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ message: RESEND_MESSAGES.wait(retryAfter), retryAfter });
    }

    try {
      await sendVerificationEmail({ to: user.email, username: user.username, token });
    } catch (mailError) {
      console.error("Verification email failed:", mailError);
      await db.collection("users").updateOne({ _id }, { $set: { emailVerifySentAt: null } });
      return res.status(502).json({ message: RESEND_MESSAGES.failed });
    }

    return res.status(200).json({ message: RESEND_MESSAGES.sent });
  } catch (error) {
    console.error("Resend Verification Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export default handler;
