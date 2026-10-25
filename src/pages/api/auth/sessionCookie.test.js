import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { encode } from "next-auth/jwt";
import { createMockCollection, createMockDb } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth", () => ({ default: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import { authOptions } from "./[...nextauth].js";
import { SESSION_USER_FIELDS } from "@/util/sessionUser";

/**
 * The login cookie stays small (S13, 26 Oct 2026). On staging a Google sign-in
 * answered 502 because the cookie carried the whole account record, activity
 * feed included, and outgrew nginx's header buffer. The jwt callback now keeps
 * only SESSION_USER_FIELDS, for both sign-ins, on every call.
 */
const { jwt, session: sessionCallback } = authOptions.callbacks;
const USER_ID = "6ac4cfd8d52b60835699bbc4";
// NextAuth splits a cookie longer than this into .0, .1 and so on (core/lib/cookie.js)
const COOKIE_CHUNK = 4096 - 163;

/** An account used a lot: a full activity feed, every profile answer, S9's fields. */
function heavyRecord(extra = {}) {
  return {
    _id: new ObjectId(USER_ID),
    username: "heavy_user",
    email: "heavy.user@example.com",
    name: "Heavy User",
    image: "https://lh3.googleusercontent.com/a/ACg8ocJ" + "x".repeat(80) + "=s96-c",
    role: "user",
    hashedPassword: "$2b$10$" + "h".repeat(53),
    hasCompletedTutorial: true,
    totalAnnotations: 412,
    isPilot: true,
    age: "25-29",
    gender: "Female",
    disability: "No",
    commuteFrequency: "Daily",
    educationalAttainment: "Bachelor's",
    occupation: "Urban planner at a local government office",
    walkingFrequency: "Daily",
    accessibilityFamiliarity: "Very familiar",
    priorAnnotationExperience: "No",
    temporaryMobility: "No",
    frequentlyWalkedCities: ["Makati", "Manila", "Quezon City", "Pasig"],
    consentAgreedAt: new Date("2026-10-01T00:00:00Z"),
    ageConfirmedAt: new Date("2026-10-01T00:00:00Z"),
    emailVerifiedAt: new Date("2026-10-01T01:00:00Z"),
    emailVerifyToken: "e".repeat(64),
    emailVerifyExpire: new Date("2026-10-02T00:00:00Z"),
    emailVerifySentAt: new Date("2026-10-01T00:00:00Z"),
    resetPasswordToken: "r".repeat(64),
    resetPasswordExpire: new Date("2026-10-05T00:00:00Z"),
    activities: Array.from({ length: 100 }, (_, i) => ({
      activity: `You finished an annotation session of 20 photos (${i})`,
      date: new Date(Date.UTC(2026, 9, 1, 0, i)),
      tag: "Annotation Session Done",
    })),
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-20T00:00:00Z"),
    ...extra,
  };
}

const ABSENT = ["hashedPassword", "activities", "age", "emailVerifyToken", "emailVerifyExpire", "emailVerifySentAt", "resetPasswordToken", "totalAnnotations", "isPilot", "occupation"];

function expectSmall(user) {
  expect(Object.keys(user).sort()).toEqual([...SESSION_USER_FIELDS].sort());
  expect(JSON.stringify(user).length).toBeLessThan(1000);
  for (const field of ABSENT) expect(user).not.toHaveProperty(field);
}

/** The cookie NextAuth would write for this token: what nginx and the browser carry. */
async function cookieLength(token) {
  return (await encode({ token, secret: "a-test-secret-of-reasonable-length-1234567890" })).length;
}

function db(findOne) {
  const users = createMockCollection({ findOne: vi.fn(findOne) });
  connectToDatabase.mockResolvedValue({ db: createMockDb({ users }) });
  return users;
}

beforeEach(() => vi.clearAllMocks());

describe("the login cookie (S13)", () => {
  it("holds only the listed fields after a password sign-in, with the flags worked out from the full record", async () => {
    const token = await jwt({ token: { sub: USER_ID }, user: heavyRecord(), account: { provider: "credentials" } });
    expectSmall(token.user);
    expect(token.user).toMatchObject({
      _id: USER_ID, username: "heavy_user", isNewGoogleUser: false, isProfileIncomplete: false, needsEmailVerification: false,
    });
  });

  it("holds only the listed fields after a Google sign-in to an existing account", async () => {
    db(async () => heavyRecord());
    const google = { id: "1234567890", name: "Heavy User", email: "Heavy.User@example.com", image: heavyRecord().image };
    const token = await jwt({ token: { sub: "1234567890" }, user: google, account: { provider: "google" } });
    expectSmall(token.user);
    expect(token.user._id).toBe(USER_ID);
    expect(token.user.needsEmailVerification).toBe(false);
  });

  it("keeps a new Google sign-in to what Google sent and the onboarding flags", async () => {
    db(async () => null);
    const google = { id: "1234567890", name: "New Person", email: "new@example.com", image: "https://lh3.googleusercontent.com/a/x" };
    const token = await jwt({ token: { sub: "1234567890" }, user: google, account: { provider: "google" } });
    expect(token.user).toEqual({
      name: "New Person", email: "new@example.com", image: "https://lh3.googleusercontent.com/a/x",
      isNewGoogleUser: true, isProfileIncomplete: true, needsEmailVerification: false,
    });
  });

  it("works out isProfileIncomplete from age before age is dropped", async () => {
    const token = await jwt({ token: {}, user: heavyRecord({ age: undefined }), account: { provider: "credentials" } });
    expect(token.user.isProfileIncomplete).toBe(true);
    expect(token.user).not.toHaveProperty("age");
  });

  it("cuts a cookie minted before S13 down on its next request, keeping its flags", async () => {
    const old = { ...heavyRecord(), _id: USER_ID, isNewGoogleUser: false, isProfileIncomplete: false, needsEmailVerification: false };
    const token = await jwt({ token: { sub: USER_ID, user: old } });
    expectSmall(token.user);
    expect(token.user).toMatchObject({ isProfileIncomplete: false, needsEmailVerification: false, hasCompletedTutorial: true });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it("still backfills _id for a cookie that has none, and keeps it small", async () => {
    db(async () => ({ _id: new ObjectId(USER_ID) }));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- a pre-_id cookie
    const { _id, ...old } = heavyRecord();
    const token = await jwt({ token: { user: old } });
    expect(token.user._id).toBe(USER_ID);
    expect(Object.keys(token.user).every((k) => SESSION_USER_FIELDS.includes(k))).toBe(true);
    expect(token.user).not.toHaveProperty("activities");
  });

  it("keeps every field the update branch sets, and nothing else", async () => {
    db(async () => ({ role: "user", emailVerifiedAt: new Date("2026-10-26") }));
    let token = { user: { _id: USER_ID, isNewGoogleUser: true, isProfileIncomplete: true, hasCompletedTutorial: false, needsEmailVerification: true } };
    token = await jwt({ token, trigger: "update", session: { username: "picked_name" } });
    token = await jwt({ token, trigger: "update", session: { profileCompleted: true } });
    token = await jwt({ token, trigger: "update", session: { tutorialCompleted: true } });
    token = await jwt({ token, trigger: "update", session: { emailVerified: true } });
    expect(token.user).toMatchObject({
      _id: USER_ID, username: "picked_name", isNewGoogleUser: false, isProfileIncomplete: false,
      hasCompletedTutorial: true, needsEmailVerification: false,
    });
    expect(token.user.emailVerifiedAt).toEqual(new Date("2026-10-26"));
    expect(Object.keys(token.user).every((k) => SESSION_USER_FIELDS.includes(k))).toBe(true);
  });

  it("encrypts to a single cookie, where the whole record did not", async () => {
    const token = await jwt({
      token: { name: "Heavy User", email: "heavy.user@example.com", picture: heavyRecord().image, sub: USER_ID },
      user: heavyRecord(),
      account: { provider: "credentials" },
    });
    expect(await cookieLength(token)).toBeLessThan(COOKIE_CHUNK);
    // Before S13 the token carried the record as it was: split into several cookies
    const before = { ...token, user: { ...heavyRecord(), _id: USER_ID } };
    expect(await cookieLength(before)).toBeGreaterThan(COOKIE_CHUNK);
  });

  it("passes the cookie's fields to the browser, and never the private ones even if they got in", async () => {
    const out = await sessionCallback({
      session: {},
      token: { user: { _id: USER_ID, username: "a", needsEmailVerification: true, hashedPassword: "h", activities: [1], emailVerifyToken: "t" } },
    });
    expect(out.user).toEqual({ _id: USER_ID, username: "a", needsEmailVerification: true });
  });
});
