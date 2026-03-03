import { connectToDatabase } from "@/util/mongodb";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const handler = async (req, res) => {
    if (req.method !== "POST") {
        res.setHeader("Allow", ["POST"]);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
        return res.status(422).json({ message: "Missing required fields." });
    }

    if (newPassword.length < 6) {
        return res.status(422).json({ message: "Password must be at least 6 characters long." });
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

        // Update the password and clear out the security reset fields
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
