import { connectToDatabase } from "@/util/mongodb";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/util/validation";

/**
 * POST /api/auth/reset-password — the second step, redeeming the emailed token.
 *
 * Hashes the token from the request and compares it with the stored hash, so
 * the token itself only ever exists in the email and the link. A token that
 * matches but has expired is refused, and a successful reset clears it, so a
 * forwarded email can't be used a second time.
 *
 * Every failure returns the same message. Telling "wrong token" apart from
 * "expired token" or "no such account" would give an attacker something to
 * probe with.
 *
 * One limitation worth knowing: sign-in sessions are self-contained tokens with
 * no server-side record, so existing sessions stay valid after a reset. If
 * someone resets because their account was taken over, the intruder stays
 * signed in until their session expires on its own.
 */
const handler = async (req, res) => {
    if (req.method !== "POST") {
        res.setHeader("Allow", ["POST"]);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    const { email, token, newPassword } = req.body;

    // email goes into a Mongo query and token into a hash, so both have to be
    // strings before we touch them
    if (
        typeof email !== "string" ||
        typeof token !== "string" ||
        typeof newPassword !== "string"
    ) {
        return res.status(422).json({ message: "Missing required fields." });
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
        return res.status(422).json({
            message: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
        });
    }

    try {
        const { db } = await connectToDatabase();

        // Check if user exists
        const user = await db.collection("users").findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "Invalid or expired reset token." });
        }

        // Hash the cleartext token from the request to compare with DB
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

        // Check mapping validity and expiration
        const isValidToken = user.resetPasswordToken === hashedToken;
        const isTokenNotExpired = user.resetPasswordExpire && new Date(user.resetPasswordExpire) > new Date();

        if (!isValidToken || !isTokenNotExpired) {
            return res.status(400).json({ message: "Invalid or expired reset token." });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Unsetting the token is what makes it single-use — without this the
        // link in the email would keep working for the rest of the hour
        await db.collection("users").updateOne(
            { email },
            {
                $set: { hashedPassword },
                $unset: {
                    resetPasswordToken: "",
                    resetPasswordExpire: "",
                }
            }
        );

        return res.status(200).json({ message: "Password has been successfully reset!" });

    } catch (error) {
        console.error("Reset Password Error:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export default handler;
