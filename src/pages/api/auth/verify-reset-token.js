import { connectToDatabase } from "@/util/mongodb";
import crypto from "crypto";

/**
 * POST /api/auth/verify-reset-token — checks a reset link without using it up.
 *
 * Exists purely so /reset-password can say "this link has expired" as the page
 * opens, rather than after someone has typed a new password twice. It changes
 * nothing, and /api/auth/reset-password runs the same check again, so this
 * endpoint being skipped or wrong cannot let a bad token through.
 *
 * Always answers 200 with a valid flag. Errors come back as invalid, because
 * from the page's point of view a database problem and an expired token call
 * for the same thing: ask for a fresh link.
 */
const handler = async (req, res) => {
    if (req.method !== "POST") {
        res.setHeader("Allow", ["POST"]);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    const { email, token } = req.body;

    if (typeof email !== "string" || typeof token !== "string") {
        return res.status(400).json({ valid: false });
    }

    try {
        const { db } = await connectToDatabase();
        const user = await db.collection("users").findOne({ email });

        // If no user or they have no active reset token
        if (!user || !user.resetPasswordToken || !user.resetPasswordExpire) {
            return res.status(200).json({ valid: false });
        }

        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
        const isValidToken = user.resetPasswordToken === hashedToken;
        const isTokenNotExpired = new Date(user.resetPasswordExpire) > new Date();

        if (isValidToken && isTokenNotExpired) {
            return res.status(200).json({ valid: true });
        }

    } catch (error) {
        console.error("Token Verification Error:", error);
    }

    return res.status(200).json({ valid: false });
};

export default handler;
