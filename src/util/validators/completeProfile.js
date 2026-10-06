export const AGE_GROUPS = [
  "18-19", "20-24", "25-29", "30-34", "35-39", "40-44",
  "45-49", "50-54", "55-59", "60-64", "65+",
];
export const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];
export const DISABILITY_ANSWERS = ["No", "Yes", "Prefer not to say"];
export const COMMUTE_FREQUENCIES = ["Daily", "A few times a week", "Once a week", "Rarely", "Never"];
export const EDUCATION_LEVELS = [
  "High school", "Some college", "Bachelor's", "Master's",
  "Doctorate", "Other", "Prefer not to say",
];
export const WALKING_FREQUENCIES = [
  "Daily", "Several times a week", "Once a week",
  "A few times a month", "Rarely", "Never",
];
export const ACCESSIBILITY_FAMILIARITY = [
  "Very familiar", "Somewhat familiar",
  "Slightly familiar", "Not at all familiar",
];
export const ANNOTATION_EXPERIENCE = ["Yes", "No"];
export const TEMPORARY_MOBILITY_ANSWERS = ["No", "Yes", "Prefer not to say"];

/**
 * Every demographic answer validateDemographics requires, with its allowlist.
 * The profile form (src/features/profile/profileFields.js) is built from this
 * map and its tests check the form sends every key, so a field added here cannot
 * be missing from the form. temporaryMobility was: the server required it from
 * 29 Sep 2026 while the form never asked it, so no new profile could be saved
 * (found and fixed 30 Sep 2026).
 */
export const DEMOGRAPHIC_ALLOWLISTS = Object.freeze({
  age: AGE_GROUPS,
  gender: GENDERS,
  disability: DISABILITY_ANSWERS,
  temporaryMobility: TEMPORARY_MOBILITY_ANSWERS,
  commuteFrequency: COMMUTE_FREQUENCIES,
  walkingFrequency: WALKING_FREQUENCIES,
  educationalAttainment: EDUCATION_LEVELS,
  accessibilityFamiliarity: ACCESSIBILITY_FAMILIARITY,
  priorAnnotationExperience: ANNOTATION_EXPERIENCE,
});
export const DEMOGRAPHIC_FIELDS = Object.freeze(Object.keys(DEMOGRAPHIC_ALLOWLISTS));

export function validateDemographics(answers = {}) {
  const given = answers || {};
  if (DEMOGRAPHIC_FIELDS.some((field) => !DEMOGRAPHIC_ALLOWLISTS[field].includes(given[field]))) {
    return { valid: false, message: "Please fill in all required demographic fields." };
  }
  return { valid: true };
}

export function validateOccupation(occupation) {
  if (typeof occupation !== "string" || occupation.trim().length === 0 || occupation.length > 100) {
    return { valid: false, message: "Occupation is required (max 100 characters)." };
  }
  return { valid: true };
}

export function validateCities(frequentlyWalkedCities) {
  const cities = Array.isArray(frequentlyWalkedCities) ? frequentlyWalkedCities : [];
  if (cities.length > 20 || cities.some((c) => typeof c !== "string" || c.length > 80)) {
    return { valid: false, message: "Too many cities, or a city name is too long." };
  }
  return { valid: true };
}
