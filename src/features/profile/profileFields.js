import { DEMOGRAPHIC_ALLOWLISTS, DEMOGRAPHIC_FIELDS } from "@/util/validators/completeProfile";

/**
 * Questions and answer options for the demographic profile form
 * (src/pages/complete-profile.jsx).
 *
 * The answer options are built from the same allowlists the server checks
 * (DEMOGRAPHIC_ALLOWLISTS in src/util/validators/completeProfile.js), and the
 * request body is built by buildProfileBody from the same field list, so the form
 * cannot silently leave out a field the server requires. That happened with
 * temporaryMobility, which the server required from 29 Sep 2026 while the form
 * never asked it, so no new profile could be saved.
 *
 * Wording (30 Sep to 1 Oct 2026):
 *   - frequentlyWalkedCities matches the manuscript's "cities frequently walked in"
 *     (the old wording asked which cities people "want to help us assess").
 *   - walkingFrequency asks about walking for any purpose, matching the
 *     manuscript's "walking and commuting frequency" and the classifier-feature
 *     rationale in pipeline_methodology.md 7c (the old wording asked only about
 *     exercise or leisure).
 *   - temporaryMobility uses the wording decided in pipeline_methodology.md 7b.
 */
export const PROFILE_QUESTIONS = Object.freeze({
  frequentlyWalkedCities: {
    label: "Which cities do you often walk in?",
    hint: "Choose all that apply.",
    placeholder: "Type or select cities (e.g., Makati, Quezon City)",
  },
  age: { label: "Age Group", placeholder: "Select age group" },
  gender: { label: "Gender", placeholder: "Select gender" },
  disability: {
    label: "Do you have any mobility impairments or disabilities?",
    placeholder: "Select an option",
  },
  temporaryMobility: {
    label: "Are you currently experiencing any temporary condition that affects how you walk?",
    hint: "(e.g., pregnancy, injury, use of crutches or walker, pushing a stroller)",
    placeholder: "Select an option",
  },
  educationalAttainment: { label: "Highest level of education", placeholder: "Select education level" },
  occupation: { label: "Occupation", placeholder: "e.g. Student, Engineer, Teacher" },
  accessibilityFamiliarity: {
    label: "How familiar are you with accessibility issues?",
    placeholder: "Select familiarity level",
  },
  priorAnnotationExperience: {
    label: "Do you have prior experience with image or data annotation?",
    placeholder: "Select an option",
  },
  commuteFrequency: {
    label: "How often do you commute (by any mode of transportation) in a typical week?",
  },
  walkingFrequency: {
    label: "How often do you walk outdoors, for any purpose (getting somewhere, running errands, exercise, or leisure)?",
  },
});

function optionLabel(field, value) {
  if (field === "age") return value === "65+" ? "65 years and over" : `${value} years`;
  return value;
}

/** [{ value, label }] for one demographic field, in the server's allowlist order. */
export function optionsFor(field) {
  const allowed = DEMOGRAPHIC_ALLOWLISTS[field];
  if (!allowed) throw new Error(`Unknown demographic field: ${field}`);
  return allowed.map((value) => ({ value, label: optionLabel(field, value) }));
}

/**
 * Builds the POST body for /api/auth/complete-profile.
 *
 * `answers` holds the raw form values: frequentlyWalkedCities (array of strings),
 * occupation (string) and one value per demographic field. Returns the body and
 * the list of required fields still missing, in form order.
 */
export function buildProfileBody(answers = {}) {
  const a = answers || {};
  const body = {
    frequentlyWalkedCities: Array.isArray(a.frequentlyWalkedCities) ? a.frequentlyWalkedCities : [],
    occupation: typeof a.occupation === "string" ? a.occupation.trim() : "",
  };
  const missing = [];
  for (const field of DEMOGRAPHIC_FIELDS) {
    const value = a[field];
    body[field] = value;
    if (!DEMOGRAPHIC_ALLOWLISTS[field].includes(value)) missing.push(field);
  }
  if (!body.occupation) missing.push("occupation");
  return { body, missing };
}
