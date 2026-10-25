import { describe, it, expect } from "vitest";
import {
  RATE_LIMITED,
  TOO_MANY_ATTEMPTS_ERROR,
  isRateLimited,
  readJson,
  rateLimitMessage,
  signInRateLimited,
} from "./authResponse";
import { AUTH_COPY } from "./authCopy";

/** Reading the auth routes' answers behind the request limit (S8, 26 Oct 2026). */
const answer = (status, body, type = "application/json") =>
  new Response(body, { status, headers: { "Content-Type": type } });

describe("authResponse", () => {
  it("says Too many attempts. Please wait a minute and try again., with no em dash or semicolon", () => {
    expect(AUTH_COPY.tooManyAttempts).toBe("Too many attempts. Please wait a minute and try again.");
    expect(AUTH_COPY.tooManyAttempts).not.toMatch(/[—;]/);
  });

  it("recognises a 429 and nothing else", () => {
    expect(RATE_LIMITED).toBe(429);
    expect(isRateLimited({ status: 429 })).toBe(true);
    for (const status of [200, 400, 401, 403, 409, 422, 500, 503]) expect(isRateLimited({ status })).toBe(false);
    expect(isRateLimited(undefined)).toBe(false);
  });

  it("reads JSON, and gives {} for nginx's HTML page, an empty body or a non-object", async () => {
    expect(await readJson(answer(200, '{"message":"ok"}'))).toEqual({ message: "ok" });
    expect(await readJson(answer(429, "<html><body>429 Too Many Requests</body></html>", "text/html"))).toEqual({});
    expect(await readJson(answer(500, ""))).toEqual({});
    expect(await readJson(answer(200, "null"))).toEqual({});
    expect(await readJson(answer(200, "42"))).toEqual({});
  });

  it("keeps a 429's own message and otherwise says to wait a minute", () => {
    expect(rateLimitMessage({ message: "You can ask for another link in 4 minutes." })).toBe("You can ask for another link in 4 minutes.");
    for (const data of [{}, { message: "" }, { message: 42 }, null, undefined]) {
      expect(rateLimitMessage(data)).toBe(AUTH_COPY.tooManyAttempts);
    }
  });

  it("tells a sign-in the limit refused from a wrong password", () => {
    expect(signInRateLimited({ status: 429, ok: false, error: TOO_MANY_ATTEMPTS_ERROR, url: null })).toBe(true);
    expect(signInRateLimited({ status: 429, ok: false, error: null })).toBe(true);
    expect(signInRateLimited({ status: 401, ok: false, error: "CredentialsSignin" })).toBe(false);
    expect(signInRateLimited({ status: 200, ok: true, error: null })).toBe(false);
    expect(signInRateLimited(undefined)).toBe(false);
  });
});
