import { describe, it, expect } from "vitest";
import {
  AGE_GROUPS,
  GENDERS,
  DISABILITY_ANSWERS,
  COMMUTE_FREQUENCIES,
  EDUCATION_LEVELS,
  WALKING_FREQUENCIES,
  ACCESSIBILITY_FAMILIARITY,
  ANNOTATION_EXPERIENCE,
  TEMPORARY_MOBILITY_ANSWERS,
  validateDemographics,
  validateOccupation,
  validateCities,
} from "./completeProfile.js";

const validDemographics = {
  age: "20-24",
  gender: "Male",
  disability: "No",
  commuteFrequency: "Daily",
  educationalAttainment: "Bachelor's",
  walkingFrequency: "Daily",
  accessibilityFamiliarity: "Somewhat familiar",
  priorAnnotationExperience: "No",
  temporaryMobility: "No",
};

describe("validateDemographics", () => {
  it("accepts all valid fields", () => {
    expect(validateDemographics(validDemographics)).toEqual({ valid: true });
  });

  it("accepts edge values from each allowlist", () => {
    const edge = {
      age: "65+",
      gender: "Prefer not to say",
      disability: "Prefer not to say",
      commuteFrequency: "Never",
      educationalAttainment: "Prefer not to say",
      walkingFrequency: "Never",
      accessibilityFamiliarity: "Not at all familiar",
      priorAnnotationExperience: "Yes",
      temporaryMobility: "Prefer not to say",
    };
    expect(validateDemographics(edge)).toEqual({ valid: true });
  });

  it("rejects invalid age group", () => {
    expect(validateDemographics({ ...validDemographics, age: "1-5" }).valid).toBe(false);
  });

  it("rejects invalid gender", () => {
    expect(validateDemographics({ ...validDemographics, gender: "invalid" }).valid).toBe(false);
  });

  it("rejects invalid disability", () => {
    expect(validateDemographics({ ...validDemographics, disability: "Maybe" }).valid).toBe(false);
  });

  it("rejects invalid commuteFrequency", () => {
    expect(validateDemographics({ ...validDemographics, commuteFrequency: "Sometimes" }).valid).toBe(false);
  });

  it("rejects invalid educationalAttainment", () => {
    expect(validateDemographics({ ...validDemographics, educationalAttainment: "PhD" }).valid).toBe(false);
  });

  it("rejects invalid walkingFrequency", () => {
    expect(validateDemographics({ ...validDemographics, walkingFrequency: "Often" }).valid).toBe(false);
  });

  it("rejects invalid accessibilityFamiliarity", () => {
    expect(validateDemographics({ ...validDemographics, accessibilityFamiliarity: "Expert" }).valid).toBe(false);
  });

  it("rejects invalid priorAnnotationExperience", () => {
    expect(validateDemographics({ ...validDemographics, priorAnnotationExperience: "Maybe" }).valid).toBe(false);
  });

  it("rejects invalid temporaryMobility", () => {
    expect(validateDemographics({ ...validDemographics, temporaryMobility: "Maybe" }).valid).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(validateDemographics({ ...validDemographics, gender: "male" }).valid).toBe(false);
  });
});

describe("validateOccupation", () => {
  it("accepts valid occupation", () => {
    expect(validateOccupation("Software Engineer")).toEqual({ valid: true });
  });

  it("rejects empty string", () => {
    expect(validateOccupation("").valid).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(validateOccupation("   ").valid).toBe(false);
  });

  it("rejects over 100 characters", () => {
    expect(validateOccupation("a".repeat(101)).valid).toBe(false);
  });

  it("accepts exactly 100 characters", () => {
    expect(validateOccupation("a".repeat(100)).valid).toBe(true);
  });

  it("rejects non-string types", () => {
    expect(validateOccupation(null).valid).toBe(false);
    expect(validateOccupation(undefined).valid).toBe(false);
    expect(validateOccupation(123).valid).toBe(false);
  });
});

describe("validateCities", () => {
  it("accepts valid array of city strings", () => {
    expect(validateCities(["Makati", "Manila"])).toEqual({ valid: true });
  });

  it("accepts empty array", () => {
    expect(validateCities([])).toEqual({ valid: true });
  });

  it("defaults non-array to empty array (valid)", () => {
    expect(validateCities(null)).toEqual({ valid: true });
    expect(validateCities(undefined)).toEqual({ valid: true });
  });

  it("rejects more than 20 cities", () => {
    const many = Array.from({ length: 21 }, (_, i) => `City${i}`);
    expect(validateCities(many).valid).toBe(false);
  });

  it("rejects city name over 80 characters", () => {
    expect(validateCities(["a".repeat(81)]).valid).toBe(false);
  });

  it("accepts city name of exactly 80 characters", () => {
    expect(validateCities(["a".repeat(80)]).valid).toBe(true);
  });

  it("rejects non-string element in array", () => {
    expect(validateCities(["Makati", 123]).valid).toBe(false);
  });
});

describe("allowlist constants", () => {
  it("AGE_GROUPS has 11 entries", () => {
    expect(AGE_GROUPS).toHaveLength(11);
    expect(AGE_GROUPS).toContain("18-19");
    expect(AGE_GROUPS).not.toContain("16-19");
  });

  it("rejects the old 16-19 age group", () => {
    expect(validateDemographics({ ...validDemographics, age: "16-19" }).valid).toBe(false);
  });

  it("GENDERS has 4 entries", () => {
    expect(GENDERS).toHaveLength(4);
  });

  it("DISABILITY_ANSWERS has 3 entries", () => {
    expect(DISABILITY_ANSWERS).toHaveLength(3);
  });

  it("COMMUTE_FREQUENCIES has 5 entries", () => {
    expect(COMMUTE_FREQUENCIES).toHaveLength(5);
  });

  it("EDUCATION_LEVELS has 7 entries", () => {
    expect(EDUCATION_LEVELS).toHaveLength(7);
  });

  it("WALKING_FREQUENCIES has 6 entries", () => {
    expect(WALKING_FREQUENCIES).toHaveLength(6);
  });

  it("ACCESSIBILITY_FAMILIARITY has 4 entries", () => {
    expect(ACCESSIBILITY_FAMILIARITY).toHaveLength(4);
  });

  it("ANNOTATION_EXPERIENCE has 2 entries", () => {
    expect(ANNOTATION_EXPERIENCE).toHaveLength(2);
  });

  it("TEMPORARY_MOBILITY_ANSWERS has 3 entries", () => {
    expect(TEMPORARY_MOBILITY_ANSWERS).toHaveLength(3);
  });
});
