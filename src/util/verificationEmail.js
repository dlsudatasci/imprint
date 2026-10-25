import crypto from "crypto";
import nodemailer from "nodemailer";
import { VERIFY_LINK_TTL_MS } from "@/util/validators/emailVerification.mjs";

/**
 * The verification mail (S9), server side only: the token, its hash, the link
 * and the message. Built like the password reset in forgot-password.js: 32
 * random bytes go in the link and only their SHA-256 is stored, so anyone able
 * to read the users collection still cannot confirm an address with it. The
 * link is built from NEXTAUTH_URL, never from the request's Host header.
 *
 * The rules (expiry, resend wait, the gate) are in
 * src/util/validators/emailVerification.mjs.
 */

/** Every word of the mail, so tests can check it: no em dashes, no semicolons. */
export const VERIFY_EMAIL_COPY = Object.freeze({
  subject: "Confirm your email for IMPRINT",
  heading: "Confirm your email address",
  greeting: (username) => (username ? `Hello ${username},` : "Hello,"),
  body: `Thank you for joining Imprint. Confirm your email address to start annotating. This link works for ${VERIFY_LINK_TTL_MS / 3600000} hours.`,
  button: "Confirm my email",
  ignore: "If you did not create an Imprint account, you can ignore this email.",
  fallback: "If the button does not work, copy this link into your browser:",
});

/** SHA-256 of a token, as stored in emailVerifyToken. */
export function hashVerifyToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/** A new token for the link and the hash to store. */
export function createVerificationToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, hashedToken: hashVerifyToken(token) };
}

/** /verify-email?token=...&email=... on our own configured origin. */
export function verifyEmailUrl(token, email, baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000") {
  const origin = baseUrl.replace(/\/+$/, "");
  return `${origin}/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The nodemailer message for `to`, with the same look as the reset mail. */
export function buildVerificationMail({ to, username, url, from = process.env.EMAIL_USER || "no-reply@imprint.com" }) {
  const c = VERIFY_EMAIL_COPY;
  const safeUrl = escapeHtml(url);
  return {
    from: `"Imprint Support" <${from}>`,
    to,
    subject: c.subject,
    text: [c.greeting(username), "", c.body, "", url, "", c.ignore].join("\n"),
    html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #004aad; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Imprint</h1>
          </div>
          <div style="padding: 30px; background-color: #ffffff;">
            <h2 style="color: #1e293b; margin-top: 0;">${c.heading}</h2>
            <p style="color: #475569; line-height: 1.6;">${escapeHtml(c.greeting(username))}</p>
            <p style="color: #475569; line-height: 1.6;">${c.body}</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${safeUrl}" style="background-color: #004aad; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">${c.button}</a>
            </div>
            <p style="color: #475569; line-height: 1.6;">${c.ignore}</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">${c.fallback}<br/>
            <a href="${safeUrl}" style="color: #004aad; word-break: break-all;">${safeUrl}</a></p>
          </div>
        </div>
      `,
  };
}

/**
 * Sends the mail with the same settings as the password reset (EMAIL_SERVICE,
 * EMAIL_USER, EMAIL_PASS). Throws when the mail could not be sent, so the
 * caller decides what that means.
 */
export async function sendVerificationEmail({ to, username, token }) {
  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  await transporter.sendMail(buildVerificationMail({ to, username, url: verifyEmailUrl(token, to) }));
}
