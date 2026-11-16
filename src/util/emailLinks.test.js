import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import { unsubscribeToken, unsubscribeUrl, oneClickUnsubscribeUrl, checkUnsubscribe } from "./emailLinks.mjs";

/** The signed stop link in participant emails (S29, 16 Nov 2026). */
const SECRET = "test-secret";
const A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbb";

describe("unsubscribe tokens", () => {
  it("checks for its own user and fails for another user, a changed token, or another secret", () => {
    const t = unsubscribeToken(A, SECRET);
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(checkUnsubscribe(A, t, SECRET)).toBe(true);
    expect(checkUnsubscribe(B, t, SECRET)).toBe(false);
    const changed = (t[0] === "0" ? "1" : "0") + t.slice(1);
    expect(checkUnsubscribe(A, changed, SECRET)).toBe(false);
    expect(checkUnsubscribe(A, t, "another-secret")).toBe(false);
    expect(checkUnsubscribe(A, t, "")).toBe(false);
  });

  it("is not the plain HMAC of the user with the secret: the key is derived for links only", () => {
    const plain = crypto.createHmac("sha256", SECRET).update(`unsubscribe:${A}`).digest("hex");
    expect(unsubscribeToken(A, SECRET)).not.toBe(plain);
  });

  it("refuses anything that is not an account id and a 64-character hex token", () => {
    const t = unsubscribeToken(A, SECRET);
    for (const [u, tok] of [[undefined, t], [null, t], ["not-an-id", t], [A, undefined], [A, ""], [A, t.slice(0, 63)], [A, `${t}00`], [A, "z".repeat(64)], [[A], t]]) {
      expect(checkUnsubscribe(u, tok, SECRET)).toBe(false);
    }
  });

  it("compares in constant time with timingSafeEqual, and is safe with tokens of different lengths", () => {
    const spy = vi.spyOn(crypto, "timingSafeEqual");
    const t = unsubscribeToken(A, SECRET);
    expect(checkUnsubscribe(A, t, SECRET)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    // A short or long token never reaches timingSafeEqual, which would throw
    expect(() => checkUnsubscribe(A, "ab", SECRET)).not.toThrow();
    expect(() => checkUnsubscribe(A, t + t, SECRET)).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("unsubscribe links", () => {
  it("is the /unsubscribe page with the id and the token, on the given origin without a doubled slash", () => {
    const url = new URL(unsubscribeUrl(A, "https://imprint.example.org/", SECRET));
    expect(url.origin + url.pathname).toBe("https://imprint.example.org/unsubscribe");
    expect(url.searchParams.get("u")).toBe(A);
    expect(checkUnsubscribe(url.searchParams.get("u"), url.searchParams.get("t"), SECRET)).toBe(true);
  });

  it("gives the one-click route the same pair", () => {
    const url = new URL(oneClickUnsubscribeUrl(A, "https://imprint.example.org", SECRET));
    expect(url.pathname).toBe("/api/email/unsubscribe");
    expect(checkUnsubscribe(url.searchParams.get("u"), url.searchParams.get("t"), SECRET)).toBe(true);
  });

  it("holds no email address", () => {
    for (const url of [unsubscribeUrl(A, "https://imprint.example.org", SECRET), oneClickUnsubscribeUrl(A, "https://imprint.example.org", SECRET)]) {
      expect(url).not.toContain("@");
      expect(url).not.toContain("%40");
      expect(url).not.toMatch(/email=/);
    }
  });
});
