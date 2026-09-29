import { describe, it, expect } from "vitest";
import {
  validateExitSurveyPayload,
  EXIT_SURVEY_QUESTIONS,
  QUESTION_KEYS,
} from "./exitSurvey";

function validResponses(overrides = {}) {
  return {
    overallExperience: "It was intuitive and straightforward.",
    clarityAndDifficulty: null,
    fatigue: null,
    behaviorChange: null,
    stopReason: null,
    aiSuggestionsImpact: null,
    aiReliance: null,
    improvements: null,
    additionalComments: null,
    ...overrides,
  };
}

function validBody(overrides = {}) {
  return { responses: validResponses(), ...overrides };
}

describe("EXIT_SURVEY_QUESTIONS", () => {
  it("has exactly 9 questions", () => {
    expect(EXIT_SURVEY_QUESTIONS).toHaveLength(9);
  });

  it("each question has key, label, and prompt", () => {
    for (const q of EXIT_SURVEY_QUESTIONS) {
      expect(q).toHaveProperty("key");
      expect(q).toHaveProperty("label");
      expect(q).toHaveProperty("prompt");
    }
  });

  it("QUESTION_KEYS matches the question objects", () => {
    expect(QUESTION_KEYS).toEqual(EXIT_SURVEY_QUESTIONS.map((q) => q.key));
  });
});

describe("validateExitSurveyPayload", () => {
  it("accepts a payload with one answered question", () => {
    const result = validateExitSurveyPayload(validBody());
    expect(result.valid).toBe(true);
    expect(result.data.responses.overallExperience).toBe(
      "It was intuitive and straightforward."
    );
  });

  it("accepts a payload with all questions answered", () => {
    const all = {};
    for (const key of QUESTION_KEYS) {
      all[key] = `Answer for ${key}`;
    }
    const result = validateExitSurveyPayload({ responses: all });
    expect(result.valid).toBe(true);
    for (const key of QUESTION_KEYS) {
      expect(result.data.responses[key]).toBe(`Answer for ${key}`);
    }
  });

  it("rejects null body", () => {
    expect(validateExitSurveyPayload(null).valid).toBe(false);
  });

  it("rejects missing responses object", () => {
    expect(validateExitSurveyPayload({}).valid).toBe(false);
  });

  it("rejects all-empty responses", () => {
    const empty = {};
    for (const key of QUESTION_KEYS) {
      empty[key] = null;
    }
    const result = validateExitSurveyPayload({ responses: empty });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("At least one question");
  });

  it("rejects all-whitespace-only responses", () => {
    const whitespace = {};
    for (const key of QUESTION_KEYS) {
      whitespace[key] = "   ";
    }
    const result = validateExitSurveyPayload({ responses: whitespace });
    expect(result.valid).toBe(false);
  });

  it("rejects non-string value", () => {
    const result = validateExitSurveyPayload(
      validBody({ responses: validResponses({ fatigue: 42 }) })
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("fatigue");
  });

  it("rejects answer over 2000 characters", () => {
    const result = validateExitSurveyPayload(
      validBody({
        responses: validResponses({
          overallExperience: "x".repeat(2001),
        }),
      })
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("2000");
  });

  it("accepts exactly 2000 characters", () => {
    const result = validateExitSurveyPayload(
      validBody({
        responses: validResponses({
          overallExperience: "x".repeat(2000),
        }),
      })
    );
    expect(result.valid).toBe(true);
  });

  it("trims whitespace and nullifies empty strings", () => {
    const result = validateExitSurveyPayload(
      validBody({
        responses: validResponses({
          overallExperience: "  Some answer  ",
          fatigue: "   ",
        }),
      })
    );
    expect(result.valid).toBe(true);
    expect(result.data.responses.overallExperience).toBe("Some answer");
    expect(result.data.responses.fatigue).toBeNull();
  });

  it("treats undefined and empty string same as null", () => {
    const r = validResponses();
    r.clarityAndDifficulty = undefined;
    r.fatigue = "";
    const result = validateExitSurveyPayload({ responses: r });
    expect(result.valid).toBe(true);
    expect(result.data.responses.clarityAndDifficulty).toBeNull();
    expect(result.data.responses.fatigue).toBeNull();
  });

  it("strips extra keys from responses", () => {
    const r = validResponses();
    r.extraField = "should be ignored";
    const result = validateExitSurveyPayload({ responses: r });
    expect(result.valid).toBe(true);
    expect(result.data.responses).not.toHaveProperty("extraField");
  });
});
