import { describe, it, expect } from "vitest";
import { PROFILE_QUESTIONS, optionsFor, buildProfileBody } from "./profileFields";
import {
  DEMOGRAPHIC_ALLOWLISTS, DEMOGRAPHIC_FIELDS, validateDemographics, validateOccupation, validateCities,
} from "@/util/validators/completeProfile";

const fullAnswers = () => ({
  frequentlyWalkedCities: ["Makati", "Quezon City"],
  occupation: "  Student  ",
  ...Object.fromEntries(DEMOGRAPHIC_FIELDS.map((f) => [f, DEMOGRAPHIC_ALLOWLISTS[f][0]])),
});

describe("PROFILE_QUESTIONS", () => {
  it("has a non-empty question for every field the server requires, plus cities and occupation", () => {
    for (const field of [...DEMOGRAPHIC_FIELDS, "frequentlyWalkedCities", "occupation"]) {
      expect(PROFILE_QUESTIONS[field]?.label, field).toBeTruthy();
    }
  });

  it("asks the temporary mobility question with the wording decided in methodology 7b", () => {
    expect(PROFILE_QUESTIONS.temporaryMobility.label).toBe(
      "Are you currently experiencing any temporary condition that affects how you walk?"
    );
  });

  it("asks about walking for any purpose, not only exercise or leisure", () => {
    expect(PROFILE_QUESTIONS.walkingFrequency.label).toMatch(/any purpose/);
    expect(PROFILE_QUESTIONS.walkingFrequency.label).not.toMatch(/specifically/);
  });

  it("asks which cities people walk in", () => {
    expect(PROFILE_QUESTIONS.frequentlyWalkedCities.label).toBe("Which cities do you often walk in?");
  });

  it("is frozen", () => {
    expect(Object.isFrozen(PROFILE_QUESTIONS)).toBe(true);
  });
});

describe("optionsFor", () => {
  it("offers exactly the server's allowlist for every demographic field, in order", () => {
    for (const field of DEMOGRAPHIC_FIELDS) {
      expect(optionsFor(field).map((o) => o.value)).toEqual(DEMOGRAPHIC_ALLOWLISTS[field]);
    }
  });

  it("labels age groups in years", () => {
    const labels = optionsFor("age").map((o) => o.label);
    expect(labels[0]).toBe("18-19 years");
    expect(labels.at(-1)).toBe("65 years and over");
  });

  it("uses the value as the label for other fields", () => {
    expect(optionsFor("temporaryMobility")).toEqual([
      { value: "No", label: "No" },
      { value: "Yes", label: "Yes" },
      { value: "Prefer not to say", label: "Prefer not to say" },
    ]);
  });

  it("throws for an unknown field", () => {
    expect(() => optionsFor("favouriteColour")).toThrow(/Unknown demographic field/);
  });
});

describe("buildProfileBody", () => {
  it("sends every field the server requires, and the server accepts a complete form", () => {
    const { body, missing } = buildProfileBody(fullAnswers());
    expect(missing).toEqual([]);
    for (const field of DEMOGRAPHIC_FIELDS) expect(body).toHaveProperty(field);
    expect(validateDemographics(body).valid).toBe(true);
    expect(validateOccupation(body.occupation).valid).toBe(true);
    expect(validateCities(body.frequentlyWalkedCities).valid).toBe(true);
  });

  it("trims the occupation", () => {
    expect(buildProfileBody(fullAnswers()).body.occupation).toBe("Student");
  });

  it("reports a missing temporary mobility answer", () => {
    const answers = fullAnswers();
    delete answers.temporaryMobility;
    expect(buildProfileBody(answers).missing).toEqual(["temporaryMobility"]);
  });

  it("reports every missing field, including a blank occupation", () => {
    const { missing } = buildProfileBody({ occupation: "   " });
    expect(missing).toEqual([...DEMOGRAPHIC_FIELDS, "occupation"]);
  });

  it("rejects values outside the allowlist", () => {
    const answers = { ...fullAnswers(), walkingFrequency: "Sometimes" };
    expect(buildProfileBody(answers).missing).toEqual(["walkingFrequency"]);
  });

  it("defaults cities to an empty list", () => {
    const answers = fullAnswers();
    delete answers.frequentlyWalkedCities;
    expect(buildProfileBody(answers).body.frequentlyWalkedCities).toEqual([]);
  });
});
