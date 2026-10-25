import { describe, it, expect } from "vitest";
import {
  VERIFY_LINK_TTL_MS,
  RESEND_INTERVAL_MS,
  EMAIL_NOT_VERIFIED_CODE,
  EMAIL_NOT_VERIFIED_RESPONSE,
  VERIFY_LINK_MESSAGES,
  RESEND_MESSAGES,
  normalizeEmail,
  needsEmailVerification,
  verificationExpiry,
  checkVerifyLink,
  resendWaitSeconds,
  resendCutoff,
} from "./emailVerification.mjs";

// Email verification (S9, decided 21 Oct 2026)
const NOW = new Date("2026-10-25T08:00:00Z");
const HASH = "a".repeat(64);
const waiting = (overrides = {}) => ({
  emailVerifiedAt: null,
  emailVerifyToken: HASH,
  emailVerifyExpire: new Date(NOW.getTime() + 60_000),
  ...overrides,
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Rans.Test@Example.COM ")).toBe("rans.test@example.com");
    expect(normalizeEmail("already@lower.case")).toBe("already@lower.case");
  });

  it("returns anything that is not a string unchanged, for the caller's type check", () => {
    for (const value of [undefined, null, 42, { $ne: null }]) expect(normalizeEmail(value)).toBe(value);
  });
});

describe("needsEmailVerification", () => {
  it("holds back a contributor whose address is not confirmed, with or without a role field", () => {
    expect(needsEmailVerification({ role: "user", emailVerifiedAt: null })).toBe(true);
    expect(needsEmailVerification({ role: "user" })).toBe(true);
    expect(needsEmailVerification({})).toBe(true);
  });

  it("lets a confirmed contributor through", () => {
    expect(needsEmailVerification({ role: "user", emailVerifiedAt: NOW })).toBe(false);
    expect(needsEmailVerification({ emailVerifiedAt: "2026-10-01T00:00:00Z" })).toBe(false);
  });

  it("never holds back annotators or admins, confirmed or not", () => {
    for (const role of ["annotator", "admin"]) {
      expect(needsEmailVerification({ role, emailVerifiedAt: null })).toBe(false);
      expect(needsEmailVerification({ role })).toBe(false);
    }
  });

  it("is false for a missing record, which the routes handle themselves", () => {
    expect(needsEmailVerification(null)).toBe(false);
    expect(needsEmailVerification(undefined)).toBe(false);
  });

  it("refuses with a code the pages recognise", () => {
    expect(EMAIL_NOT_VERIFIED_RESPONSE.code).toBe(EMAIL_NOT_VERIFIED_CODE);
    expect(EMAIL_NOT_VERIFIED_CODE).toBe("EMAIL_NOT_VERIFIED");
  });
});

describe("verificationExpiry", () => {
  it("is 24 hours after the send", () => {
    expect(VERIFY_LINK_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(verificationExpiry(NOW).getTime() - NOW.getTime()).toBe(VERIFY_LINK_TTL_MS);
  });
});

describe("checkVerifyLink", () => {
  it("accepts the newest link before it expires", () => {
    expect(checkVerifyLink(waiting(), HASH, NOW)).toEqual({ ok: true });
  });

  it("refuses a wrong or older link, and an account with no link waiting", () => {
    expect(checkVerifyLink(waiting(), "b".repeat(64), NOW)).toEqual({ ok: false, code: "invalid" });
    expect(checkVerifyLink(waiting({ emailVerifyToken: undefined }), HASH, NOW)).toEqual({ ok: false, code: "invalid" });
    expect(checkVerifyLink(null, HASH, NOW)).toEqual({ ok: false, code: "invalid" });
    expect(checkVerifyLink(waiting(), undefined, NOW)).toEqual({ ok: false, code: "invalid" });
  });

  it("refuses the newest link once it has expired, exactly at the expiry too", () => {
    expect(checkVerifyLink(waiting({ emailVerifyExpire: new Date(NOW.getTime() - 1) }), HASH, NOW)).toEqual({ ok: false, code: "expired" });
    expect(checkVerifyLink(waiting({ emailVerifyExpire: NOW }), HASH, NOW)).toEqual({ ok: false, code: "expired" });
    expect(checkVerifyLink(waiting({ emailVerifyExpire: undefined }), HASH, NOW)).toEqual({ ok: false, code: "expired" });
    expect(checkVerifyLink(waiting({ emailVerifyExpire: "not a date" }), HASH, NOW)).toEqual({ ok: false, code: "expired" });
  });

  it("never reports a wrong link as expired", () => {
    const old = waiting({ emailVerifyExpire: new Date(NOW.getTime() - 1) });
    expect(checkVerifyLink(old, "b".repeat(64), NOW)).toEqual({ ok: false, code: "invalid" });
  });

  it("reports a link opened again after the address was confirmed as used", () => {
    expect(checkVerifyLink({ emailVerifiedAt: NOW }, HASH, NOW)).toEqual({ ok: false, code: "used" });
    expect(checkVerifyLink(waiting({ emailVerifiedAt: NOW }), HASH, NOW)).toEqual({ ok: false, code: "used" });
  });
});

describe("resendWaitSeconds and resendCutoff", () => {
  it("allows one mail per five minutes", () => {
    expect(RESEND_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(resendWaitSeconds({ emailVerifySentAt: NOW }, NOW)).toBe(300);
    expect(resendWaitSeconds({ emailVerifySentAt: new Date(NOW.getTime() - 61_000) }, NOW)).toBe(239);
    expect(resendWaitSeconds({ emailVerifySentAt: new Date(NOW.getTime() - RESEND_INTERVAL_MS) }, NOW)).toBe(0);
    expect(resendCutoff(NOW).getTime()).toBe(NOW.getTime() - RESEND_INTERVAL_MS);
  });

  it("does not wait when nothing was sent, or the send was undone", () => {
    for (const sent of [undefined, null, "nope"]) expect(resendWaitSeconds({ emailVerifySentAt: sent }, NOW)).toBe(0);
    expect(resendWaitSeconds(null, NOW)).toBe(0);
  });

  it("says the wait in whole minutes", () => {
    expect(RESEND_MESSAGES.wait(300)).toBe("You can ask for another link in 5 minutes.");
    expect(RESEND_MESSAGES.wait(30)).toBe("You can ask for another link in 1 minute.");
    expect(RESEND_MESSAGES.wait(61)).toBe("You can ask for another link in 2 minutes.");
  });
});

describe("messages", () => {
  it("have no em dashes or semicolons, and every link outcome has one", () => {
    const all = [
      EMAIL_NOT_VERIFIED_RESPONSE.message,
      ...Object.values(VERIFY_LINK_MESSAGES),
      ...Object.values(RESEND_MESSAGES).map((m) => (typeof m === "function" ? m(120) : m)),
    ];
    for (const s of all) expect(s).not.toMatch(/[—;]/);
    for (const code of ["ok", "invalid", "expired", "used", "missing"]) expect(VERIFY_LINK_MESSAGES[code]).toBeTruthy();
  });
});
