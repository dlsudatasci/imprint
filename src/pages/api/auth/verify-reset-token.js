import { connectToDatabase } from "@/util/mongodb";
import crypto from "crypto";

const handler = async (req, res) => {
    if (req.method !== "POST") {
        res.setHeader("Allow", ["POST"]);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    const { email, token } = req.body;

    if (!email || !token) {
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
