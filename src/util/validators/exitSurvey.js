/**
 * Exit survey validation. Nine open-ended questions (all optional, max 2000
 * chars each). At least one non-empty answer is required to submit.
 */
const MAX_LENGTH = 2000;

export const EXIT_SURVEY_QUESTIONS = [
  {
    key: "overallExperience",
    label: "Overall Experience",
    prompt:
      "Overall, how would you describe your experience using the annotation interface?",
  },
  {
    key: "clarityAndDifficulty",
    label: "Clarity and Difficulty",
    prompt:
      "Which parts of the annotation task were clear and easy, and which were confusing or difficult? Were the obstruction categories and the severity rating clear to you?",
  },
  {
    key: "fatigue",
    label: "Fatigue",
    prompt:
      "Did you find the task tiring at any point? If so, when did it begin to feel tiring (for example, within a session, or after several sessions), and what made it so?",
  },
  {
    key: "behaviorChange",
    label: "Behavior Change",
    prompt:
      "Did you notice any change in how carefully or how quickly you worked as you annotated more images? Please describe.",
  },
  {
    key: "stopReason",
    label: "Reason for Stopping",
    prompt:
      "What made you decide to stop when you did, whether during a single session or for the study as a whole?",
  },
  {
    key: "aiSuggestionsImpact",
    label: "AI Suggestions Impact",
    prompt:
      "The interface showed AI-suggested boxes and labels. In what situations did these suggestions help you, and in what situations did they get in the way or require extra effort to correct?",
  },
  {
    key: "aiReliance",
    label: "AI Reliance",
    prompt:
      "How much did you rely on the AI suggestions, and did your reliance on them change over time?",
  },
  {
    key: "improvements",
    label: "Improvements",
    prompt:
      "What would make the annotation task easier or more sustainable to keep doing?",
  },
  {
    key: "additionalComments",
    label: "Additional Comments",
    prompt:
      "Is there anything else about your experience you would like to share?",
  },
];

export const QUESTION_KEYS = EXIT_SURVEY_QUESTIONS.map((q) => q.key);

export function validateExitSurveyPayload(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, reason: "Request body must be an object." };
  }

  const { responses } = body;
  if (!responses || typeof responses !== "object") {
    return { valid: false, reason: "responses object is required." };
  }

  const cleaned = {};
  for (const key of QUESTION_KEYS) {
    const val = responses[key];
    if (val === undefined || val === null || val === "") {
      cleaned[key] = null;
      continue;
    }
    if (typeof val !== "string") {
      return { valid: false, reason: `${key} must be a string.` };
    }
    if (val.length > MAX_LENGTH) {
      return {
        valid: false,
        reason: `${key} must be at most ${MAX_LENGTH} characters.`,
      };
    }
    cleaned[key] = val.trim() || null;
  }

  const hasContent = QUESTION_KEYS.some((k) => cleaned[k] !== null);
  if (!hasContent) {
    return {
      valid: false,
      reason: "At least one question must have a non-empty answer.",
    };
  }

  return { valid: true, data: { responses: cleaned } };
}
