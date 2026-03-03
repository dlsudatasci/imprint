import { connectToDatabase } from "@/util/mongodb";
import crypto from "crypto";
import nodemailer from "nodemailer";

const handler = async (req, res) => {
    if (req.method !== "POST") {
        res.setHeader("Allow", ["POST"]);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    const { email } = req.body;

    if (!email || !email.includes("@")) {
        return res.status(422).json({ message: "Invalid email address." });
    }

    try {
        const { db } = await connectToDatabase();

        // Check if user exists
        const user = await db.collection("users").findOne({ email });
        if (!user) {
            // Security best practice: Do not reveal if an email exists or not
            return res.status(200).json({ message: "If that email exists, a reset link has been sent." });
        }

        // Generate secure reset token
        const token = crypto.randomBytes(32).toString("hex");

        // Hash token to save in DB
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

        // Expiration time (1 hour from now)
        const tokenExpiration = new Date();
        tokenExpiration.setHours(tokenExpiration.getHours() + 1);

        // Save token and expiration to user document
        await db.collection("users").updateOne(
            { email },
            {
                $set: {
                    resetPasswordToken: hashedToken,
                    resetPasswordExpire: tokenExpiration,
                }
            }
        );

        // Create reset URL
        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        const host = req.headers.host || 'localhost:3000';
        const resetUrl = `${protocol}://${host}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

        // Set up nodemailer transport
        // Ensure you have these environment variables set in .env.local!
        const transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE || 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: `"Imprint Support" <${process.env.EMAIL_USER || 'no-reply@imprint.com'}>`,
            to: email,
            subject: "Password Reset Request - Imprint",
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #004aad; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Imprint</h1>
          </div>
          <div style="padding: 30px; background-color: #ffffff;">
            <h2 style="color: #1e293b; margin-top: 0;">Password Reset Request</h2>
            <p style="color: #475569; line-height: 1.6;">Hello ${user.username},</p>
            <p style="color: #475569; line-height: 1.6;">We received a request to reset the password for your Imprint account. If you made this request, click the button below to reset your password. This link is only valid for 1 hour.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #004aad; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
            </div>
            <p style="color: #475569; line-height: 1.6;">If you didn't request a password reset, you can safely ignore this email. Your password will not change.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">If the button doesn't work, copy and paste this link into your browser:<br/>
            <a href="${resetUrl}" style="color: #004aad; word-break: break-all;">${resetUrl}</a></p>
          </div>
        </div>
      `,
        };

        // Send the email
        await transporter.sendMail(mailOptions);

        return res.status(200).json({ message: "If that email exists, a reset link has been sent." });

    } catch (error) {
        console.error("Forgot Password Error:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export default handler;
