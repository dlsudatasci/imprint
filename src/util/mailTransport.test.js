import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { createMockReq, createMockRes, createMockCollection, createMockDb } from "@/test-utils/api-helpers";

/**
 * The two mails IMPRINT sends, built by the installed nodemailer (10.x from S7,
 * 26 Oct 2026) rather than a stand-in. Only the network is replaced: each
 * transporter the code creates is swapped for nodemailer's own stream
 * transport, which writes the finished message to a buffer. So this checks
 * that the options forgot-password.js and verificationEmail.js pass are still
 * understood after the 9.0 and 10.0 breaking changes, and that the messages
 * come out with the right headers and a working link.
 */
const { created, sent } = vi.hoisted(() => ({ created: [], sent: [] }));

vi.mock("nodemailer", async (importOriginal) => {
  const actual = await importOriginal();
  const nodemailer = actual.default ?? actual;
  return {
    default: {
      ...nodemailer,
      createTransport: (options) => {
        created.push({ options, real: nodemailer.createTransport(options) });
        const stream = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
        return {
          sendMail: async (message) => {
            const info = await stream.sendMail(message);
            sent.push(info);
            return info;
          },
        };
      },
    },
  };
});
vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import forgotPassword from "@/pages/api/auth/forgot-password";
import { sendVerificationEmail, hashVerifyToken } from "@/util/verificationEmail";

/** The message as a reader sees it: quoted-printable soft breaks and escapes undone. */
function decoded(info) {
  return info.message
    .toString()
    .replace(/=\n/g, "")
    .replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

beforeEach(() => {
  created.length = 0;
  sent.length = 0;
  vi.stubEnv("EMAIL_SERVICE", "gmail");
  vi.stubEnv("EMAIL_USER", "imprint.mailer@example.com");
  vi.stubEnv("EMAIL_PASS", "app-password");
  vi.stubEnv("NEXTAUTH_URL", "https://imprint.example.org");
});
afterEach(() => vi.unstubAllEnvs());

describe("nodemailer 10 (S7)", () => {
  it("still resolves the gmail service to Gmail's SMTP server over TLS", async () => {
    const actual = await vi.importActual("nodemailer");
    const nodemailer = actual.default ?? actual;
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: "a@example.com", pass: "p" } });
    expect(transporter.transporter.name).toBe("SMTP");
    expect(transporter.transporter.options).toMatchObject({ host: "smtp.gmail.com", port: 465, secure: true });
  });

  it("builds the password reset mail with a link whose token matches the stored hash", async () => {
    const users = createMockCollection({ findOne: vi.fn().mockResolvedValue({ email: "user@example.com", username: "rans_test" }) });
    connectToDatabase.mockResolvedValue({ db: createMockDb({ users }) });
    const res = createMockRes();
    await forgotPassword(createMockReq({ body: { email: " User@Example.com " } }), res);

    expect(res._status).toBe(200);
    expect(created[0].options).toEqual({ service: "gmail", auth: { user: "imprint.mailer@example.com", pass: "app-password" } });
    expect(created[0].real.transporter.options).toMatchObject({ host: "smtp.gmail.com", port: 465, secure: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].envelope).toEqual({ from: "imprint.mailer@example.com", to: ["user@example.com"] });

    const raw = decoded(sent[0]);
    expect(raw).toMatch(/^From: "?Imprint Support"? <imprint\.mailer@example\.com>$/m);
    expect(raw).toMatch(/^To: user@example\.com$/m);
    expect(raw).toMatch(/^Subject: Password Reset Request - Imprint$/m);
    const link = /https:\/\/imprint\.example\.org\/reset-password\?token=([0-9a-f]{64})&email=user%40example\.com/.exec(raw);
    expect(link).not.toBeNull();
    const stored = users.updateOne.mock.calls[0][1].$set.resetPasswordToken;
    expect(crypto.createHash("sha256").update(link[1]).digest("hex")).toBe(stored);
  });

  it("builds the verification mail with its subject, both parts and the link", async () => {
    await sendVerificationEmail({ to: "new@example.com", username: "newuser", token: "a".repeat(64) });

    expect(created[0].options).toEqual({ service: "gmail", auth: { user: "imprint.mailer@example.com", pass: "app-password" } });
    expect(sent[0].envelope).toEqual({ from: "imprint.mailer@example.com", to: ["new@example.com"] });
    const raw = decoded(sent[0]);
    expect(raw).toMatch(/^Subject: Confirm your email for IMPRINT$/m);
    expect(raw).toContain("Content-Type: text/plain");
    expect(raw).toContain("Content-Type: text/html");
    expect(raw).toContain(`https://imprint.example.org/verify-email?token=${"a".repeat(64)}&email=new%40example.com`);
    expect(hashVerifyToken("a".repeat(64))).toMatch(/^[0-9a-f]{64}$/);
  });
});
