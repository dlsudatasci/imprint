import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { HERO_COPY } from "./home/heroCopy";
import { ABOUT_COPY } from "./about/aboutCopy";
import { PRIVACY_COPY } from "./legal/privacyCopy";
import { GUIDE_COPY } from "./contribute/help/guideCopy";
import { SEVERITY_SCALE, SCENE_QUESTIONS, CATEGORY_GROUPS } from "./contribute/help/taskFacts";
import { FOOTER_COPY, STUDY_LINKS } from "./footerMain/footerCopy";
import { NAV_COPY, PUBLIC_LINKS } from "./navbarMain/navCopy";
import { AUTH_COPY } from "./auth/authCopy";
import { NOT_FOUND_COPY } from "./notFound/notFoundCopy";
import { SESSION_PICKER_COPY } from "./annotate/SessionSizeOptions";
import { PROFILE_QUESTIONS } from "./profile/profileFields";
import { DEMOGRAPHIC_FIELDS } from "@/util/validators/completeProfile";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/util/validation";

/**
 * The public pages' copy (16 Oct 2026, IMPRINT_public_redesign.md).
 */

/** Every string in a copy object, functions called with a sample value */
function strings(value) {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [String(value(2026))];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const ALL_COPY = {
  HERO_COPY, ABOUT_COPY, PRIVACY_COPY, GUIDE_COPY, FOOTER_COPY, NAV_COPY, AUTH_COPY, NOT_FOUND_COPY, SESSION_PICKER_COPY,
  SEVERITY_SCALE, SCENE_QUESTIONS, CATEGORY_GROUPS, STUDY_LINKS, PUBLIC_LINKS,
};

describe("public page copy", () => {
  it("has no em dashes and no semicolons", () => {
    for (const [name, copy] of Object.entries(ALL_COPY)) {
      for (const s of strings(copy)) {
        expect(s, `${name}: ${s}`).not.toMatch(/[—;]/);
      }
    }
  });

  // chapter_4.tex, Ethical Considerations: the hypotheses are withheld until
  // the debriefing, and Research Design: reference images must be
  // indistinguishable from the rest. The public pages say neither.
  it("does not name the withheld study details or the reference images", () => {
    const withheld = /fatigue|hypothes|reference image|quality check|anchor|rely on|reliance|over-reliance/i;
    for (const [name, copy] of Object.entries(ALL_COPY)) {
      for (const s of strings(copy)) {
        expect(s, `${name}: ${s}`).not.toMatch(withheld);
      }
    }
  });

  // Rans, 16 Oct 2026: Imprint is a platform others can use, not one study
  it("calls Imprint a platform, never a research platform", () => {
    for (const [name, copy] of Object.entries(ALL_COPY)) {
      for (const s of strings(copy)) {
        expect(s, `${name}: ${s}`).not.toMatch(/research platform/i);
      }
    }
  });

  it("describes the second photo source as an earlier research group's, without naming it or calling it a dataset", () => {
    expect(ABOUT_COPY.photos.text).toContain("earlier research group");
    for (const [name, copy] of Object.entries(ALL_COPY)) {
      for (const s of strings(copy)) {
        expect(s, `${name}: ${s}`).not.toMatch(/atlas/i);
      }
    }
    expect(ABOUT_COPY.photos.text).not.toMatch(/dataset/i);
  });

  it("keeps the old welcome on the onboarding pages", () => {
    expect(AUTH_COPY.username.title).toBe("Welcome to Imprint!");
    expect(AUTH_COPY.username.subtitle).toBe("Please choose a username to continue.");
    expect(AUTH_COPY.profile.title).toBe("Almost there!");
    expect(AUTH_COPY.profile.subtitle).toBe("We just need a few more details to set up your Imprint profile so you can start mapping with us.");
  });

  it("states the password rule the server applies", () => {
    expect(AUTH_COPY.register.passwordHint).toContain(String(MIN_PASSWORD_LENGTH));
    expect(AUTH_COPY.reset.lengthRule).toContain(String(MIN_PASSWORD_LENGTH));
    expect(AUTH_COPY.reset.lengthRule).toContain(String(MAX_PASSWORD_LENGTH));
  });
});

describe("Privacy Policy", () => {
  // One phrase per question on the profile form. A new question added to the
  // form without a line in the policy fails the key check below.
  const PHRASES = {
    frequentlyWalkedCities: "cities you often walk in",
    age: "age group",
    gender: "gender",
    disability: "mobility impairment or disability",
    temporaryMobility: "temporary condition that affects how you walk",
    educationalAttainment: "highest level of education",
    occupation: "occupation",
    accessibilityFamiliarity: "familiar you are with accessibility issues",
    priorAnnotationExperience: "image or data annotation before",
    commuteFrequency: "how often you commute",
    walkingFrequency: "and walk",
  };

  it("names every question the profile form asks", () => {
    expect(Object.keys(PHRASES).sort()).toEqual(Object.keys(PROFILE_QUESTIONS).sort());
    expect(Object.keys(PROFILE_QUESTIONS)).toEqual(expect.arrayContaining([...DEMOGRAPHIC_FIELDS]));
    const profileLine = PRIVACY_COPY.sections[0].items.find((s) => s.startsWith("Your profile"));
    for (const [field, phrase] of Object.entries(PHRASES)) {
      expect(profileLine, field).toContain(phrase);
    }
  });

  it("no longer lists data the form never asked for, and states a retention period", () => {
    const text = strings(PRIVACY_COPY).join(" ");
    expect(text).not.toMatch(/city of residence|mobility aids|public utility vehicle|being confirmed/i);
    const retention = PRIVACY_COPY.sections.find((s) => s.title === "How long it is kept");
    expect(retention.paragraphs[0]).toBe("Your data is kept only for the duration of the study and the analysis that follows it.");
  });
});

describe("source files", () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name)) files.push(p);
    }
  };
  walk(join(process.cwd(), "src"));

  it("load no images from svgrepo.com (the Google mark is inline, GoogleMark.jsx)", () => {
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/["'`]https?:\/\/(www\.)?svgrepo\.com/);
  });

  it("no longer point at the removed screen recordings", () => {
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toContain("/images/help/");
  });
});
