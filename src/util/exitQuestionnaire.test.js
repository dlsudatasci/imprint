import { describe, it, expect } from "vitest";
import { createFakeDb } from "@/test-utils/fakeMongo";
import { exitQuestionnaireState, exitQuestionnaireOpen, hasLinkedInvitation, withoutInvitationLink } from "./exitQuestionnaire.mjs";
import { sitePath } from "./notifications.mjs";
import { loginPathFor, afterLoginPath, RETURN_PATHS } from "./loginReturn.mjs";

/**
 * The exit questionnaire invitation on the site (S33, 17 Nov 2026): one fact,
 * sent and not answered, for the dashboard button and the bell's link. And
 * the sign-in that comes back to the questionnaire.
 */
const ID = "0000000000000000000000a1";
const send = (extra = {}) => ({ campaign: "exit-questionnaire", userId: ID, status: "sent", trigger: "manual", ...extra });

describe("exitQuestionnaireState", () => {
  it("is open for someone sent it with no response, and closes once they submit", async () => {
    const { db, collections } = createFakeDb({ email_sends: [send()], exit_surveys: [] });
    expect(await exitQuestionnaireState(db, ID)).toEqual({ sent: true, answered: false });
    expect(await exitQuestionnaireOpen(db, ID)).toBe(true);
    collections.exit_surveys.rows.push({ userId: ID, responses: { a: "b" } });
    expect(await exitQuestionnaireOpen(db, ID)).toBe(false);
  });

  it("is shut with no send, a failed or a still-sending one, or another campaign's send", async () => {
    for (const email_sends of [[], [send({ status: "failed" })], [send({ status: "sending" })], [send({ campaign: "welcome-nudge" })], [send({ userId: "other" })]]) {
      const { db } = createFakeDb({ email_sends, exit_surveys: [] });
      expect(await exitQuestionnaireOpen(db, ID), JSON.stringify(email_sends)).toBe(false);
    }
  });

  it("reads the id as text, as both collections store it", async () => {
    const { db } = createFakeDb({ email_sends: [send()], exit_surveys: [] });
    expect(await exitQuestionnaireOpen(db, { toString: () => ID })).toBe(true);
  });
});

describe("the invitation's link in the feed", () => {
  const invitation = { tag: "message", title: "Tell us about your experience", activity: "x", date: new Date(), campaign: "exit-questionnaire", href: "/contribute/exit-survey" };
  const other = { tag: "message", title: "1,000 photos reached!", activity: "y", date: new Date(), campaign: "milestone-1000", href: "/contribute" };

  it("finds an invitation with a link, and takes only its link off", () => {
    expect(hasLinkedInvitation([other, invitation])).toBe(true);
    expect(hasLinkedInvitation([other])).toBe(false);
    expect(hasLinkedInvitation(undefined)).toBe(false);
    const out = withoutInvitationLink([other, invitation]);
    expect(out[0]).toEqual(other);
    expect(out[1]).toEqual({ tag: "message", title: "Tell us about your experience", activity: "x", date: invitation.date, campaign: "exit-questionnaire" });
    expect(withoutInvitationLink(null)).toEqual([]);
  });
});

describe("sitePath", () => {
  it("takes a path on this site and nothing else", () => {
    for (const ok of ["/", "/contribute", "/contribute/exit-survey?x=1"]) expect(sitePath(ok)).toBe(ok);
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "contribute", "javascript:alert(1)", "", null, undefined, 7, {}]) {
      expect(sitePath(bad), String(bad)).toBeNull();
    }
  });
});

describe("coming back to the questionnaire after signing in", () => {
  it("sends a signed-out visitor to the questionnaire to sign in with next, and anyone else to plain /login", () => {
    // The leaderboard too, from the leaderboard announcement (18 Nov 2026)
    expect(RETURN_PATHS).toEqual(["/contribute/exit-survey", "/contribute/leaderboard"]);
    expect(loginPathFor("/contribute/exit-survey")).toBe("/login?next=%2Fcontribute%2Fexit-survey");
    for (const p of ["/contribute", "/contribute/annotate", undefined]) expect(loginPathFor(p)).toBe("/login");
  });

  it("returns to the questionnaire after sign-in, and to the dashboard for any other next", () => {
    expect(afterLoginPath("/contribute/exit-survey")).toBe("/contribute/exit-survey");
    for (const next of [undefined, "", "/admin", "https://evil.example/contribute/exit-survey", "//evil.example", ["/contribute/exit-survey"]]) {
      expect(afterLoginPath(next), String(next)).toBe("/contribute");
    }
  });
});
