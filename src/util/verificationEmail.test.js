import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

const mockSendMail = vi.fn().mockResolvedValue({ messageId: "test-id" });
const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));
vi.mock("nodemailer", () => ({ default: { createTransport: (...args) => mockCreateTransport(...args) } }));

import {
  VERIFY_EMAIL_COPY,
  hashVerifyToken,
  createVerificationToken,
  verifyEmailUrl,
  buildVerificationMail,
  sendVerificationEmail,
} from "./verificationEmail";

// The verification mail (S9, decided 21 Oct 2026)
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("the token", () => {
  it("is 32 random bytes in hex, and only its SHA-256 is stored", () => {
    const a = createVerificationToken();
    const b = createVerificationToken();
    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hashedToken).toBe(crypto.createHash("sha256").update(a.token).digest("hex"));
    expect(a.hashedToken).not.toBe(a.token);
    expect(hashVerifyToken(a.token)).toBe(a.hashedToken);
  });
});

describe("the link", () => {
  it("is built from NEXTAUTH_URL, never the request, with the address encoded", () => {
    expect(verifyEmailUrl("abc", "a+b@example.com", "https://imprint.example.org//")).toBe(
      "https://imprint.example.org/verify-email?token=abc&email=a%2Bb%40example.com"
    );
    vi.stubEnv("NEXTAUTH_URL", "http://vm.example:8080");
    expect(verifyEmailUrl("t", "x@y.z")).toBe("http://vm.example:8080/verify-email?token=t&email=x%40y.z");
  });
});

describe("the mail", () => {
  it("is titled Confirm your email for IMPRINT and carries the link in the button, the fallback and the text", () => {
    const url = "https://imprint.example.org/verify-email?token=t&email=x%40y.z";
    const mail = buildVerificationMail({ to: "x@y.z", username: "rans_test", url, from: "imprint@example.com" });
    expect(mail.subject).toBe("Confirm your email for IMPRINT");
    expect(mail.to).toBe("x@y.z");
    expect(mail.from).toBe('"Imprint Support" <imprint@example.com>');
    expect(mail.html).toContain('href="https://imprint.example.org/verify-email?token=t&amp;email=x%40y.z"');
    expect(mail.html).toContain("Hello rans_test,");
    expect(mail.text).toContain(url);
  });

  it("escapes the username in the HTML", () => {
    const mail = buildVerificationMail({ to: "x@y.z", username: "<b>x</b>", url: "https://a.b/verify-email" });
    expect(mail.html).not.toContain("<b>x</b>");
    expect(mail.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("has no em dashes or semicolons in its words", () => {
    const words = Object.values(VERIFY_EMAIL_COPY).map((v) => (typeof v === "function" ? v("rans") : v));
    for (const s of words) expect(s).not.toMatch(/[—;]/);
    expect(VERIFY_EMAIL_COPY.body).toContain("24 hours");
  });

  it("is sent with the password reset's mail settings to the address given", async () => {
    vi.stubEnv("EMAIL_SERVICE", "gmail");
    vi.stubEnv("EMAIL_USER", "imprint@example.com");
    vi.stubEnv("EMAIL_PASS", "app-password");
    await sendVerificationEmail({ to: "x@y.z", username: "rans_test", token: "t0k" });
    expect(mockCreateTransport).toHaveBeenCalledWith({
      service: "gmail",
      auth: { user: "imprint@example.com", pass: "app-password" },
    });
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe("x@y.z");
    expect(mail.html).toContain("token=t0k&amp;email=x%40y.z");
  });

  it("throws when the mail cannot be sent, so the caller decides", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("smtp down"));
    await expect(sendVerificationEmail({ to: "x@y.z", token: "t" })).rejects.toThrow("smtp down");
  });
});
