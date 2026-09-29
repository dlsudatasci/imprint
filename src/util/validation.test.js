import { describe, it, expect } from "vitest";
import {
  USERNAME_PATTERN,
  EMAIL_PATTERN,
  MAX_EMAIL_LENGTH,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "./validation.js";

describe("USERNAME_PATTERN", () => {
  it("accepts valid usernames", () => {
    expect(USERNAME_PATTERN.test("francis_bawa")).toBe(true);
    expect(USERNAME_PATTERN.test("user.name")).toBe(true);
    expect(USERNAME_PATTERN.test("user-name")).toBe(true);
    expect(USERNAME_PATTERN.test("abc")).toBe(true);
    expect(USERNAME_PATTERN.test("a".repeat(30))).toBe(true);
    expect(USERNAME_PATTERN.test("User123")).toBe(true);
  });

  it("rejects usernames that are too short", () => {
    expect(USERNAME_PATTERN.test("ab")).toBe(false);
    expect(USERNAME_PATTERN.test("")).toBe(false);
  });

  it("rejects usernames that are too long", () => {
    expect(USERNAME_PATTERN.test("a".repeat(31))).toBe(false);
  });

  it("rejects usernames with forbidden characters", () => {
    expect(USERNAME_PATTERN.test("user$name")).toBe(false);
    expect(USERNAME_PATTERN.test("user name")).toBe(false);
    expect(USERNAME_PATTERN.test("user@name")).toBe(false);
    expect(USERNAME_PATTERN.test("user/name")).toBe(false);
  });
});

describe("EMAIL_PATTERN", () => {
  it("accepts valid email shapes", () => {
    expect(EMAIL_PATTERN.test("user@example.com")).toBe(true);
    expect(EMAIL_PATTERN.test("a@b.c")).toBe(true);
    expect(EMAIL_PATTERN.test("user.name+tag@domain.co")).toBe(true);
  });

  it("rejects obvious non-emails", () => {
    expect(EMAIL_PATTERN.test("userexample.com")).toBe(false);
    expect(EMAIL_PATTERN.test("user @example.com")).toBe(false);
    expect(EMAIL_PATTERN.test("@example.com")).toBe(false);
    expect(EMAIL_PATTERN.test("user@")).toBe(false);
    expect(EMAIL_PATTERN.test("")).toBe(false);
  });
});

describe("password and email constants", () => {
  it("MIN_PASSWORD_LENGTH is 6", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(6);
  });

  it("MAX_PASSWORD_LENGTH is 200", () => {
    expect(MAX_PASSWORD_LENGTH).toBe(200);
  });

  it("MAX_EMAIL_LENGTH is 254", () => {
    expect(MAX_EMAIL_LENGTH).toBe(254);
  });
});
