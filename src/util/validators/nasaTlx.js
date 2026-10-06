/**
 * Raw NASA-TLX workload assessment. Six scales (1-20 integer), trigger
 * formula, and payload validation for submit/dismiss actions.
 */
export const NASA_TLX_SCALES = [
  {
    key: "mentalDemand",
    label: "Mental Demand",
    description: "How mentally demanding was the task?",
    lowLabel: "Very Low",
    highLabel: "Very High",
  },
  {
    key: "physicalDemand",
    label: "Physical Demand",
    description: "How physically demanding was the task?",
    lowLabel: "Very Low",
    highLabel: "Very High",
  },
  {
    key: "temporalDemand",
    label: "Temporal Demand",
    description: "How hurried or rushed was the pace of the task?",
    lowLabel: "Very Low",
    highLabel: "Very High",
  },
  {
    key: "performance",
    label: "Performance",
    description: "How successful were you in accomplishing what you were asked to do?",
    lowLabel: "Very Low",
    highLabel: "Very High",
  },
  {
    key: "effort",
    label: "Effort",
    description: "How hard did you have to work to accomplish your level of performance?",
    lowLabel: "Very Low",
    highLabel: "Very High",
  },
  {
    key: "frustration",
    label: "Frustration",
    description: "How insecure, discouraged, irritated, stressed, and annoyed were you?",
    lowLabel: "Very Low",
    highLabel: "Very High",
  },
];

const SCALE_KEYS = NASA_TLX_SCALES.map((s) => s.key);
const SESSION_ID_RE = /^[0-9a-f]{24}$/;

export function shouldShowNasaTlx(sessionNumber) {
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1) return false;
  if (sessionNumber === 1 || sessionNumber === 3) return true;
  return sessionNumber > 3 && (sessionNumber - 3) % 5 === 0;
}

function isValidRating(v) {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 20;
}

export function validateNasaTlxPayload(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, reason: "Body is required." };
  }

  const { sessionId, dismissed, responses, sessionNumber } = body;

  if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) {
    return { valid: false, reason: "sessionId must be a 24-character hex string." };
  }

  if (typeof dismissed !== "boolean") {
    return { valid: false, reason: "dismissed must be a boolean." };
  }

  if (!Number.isInteger(sessionNumber) || sessionNumber < 1) {
    return { valid: false, reason: "sessionNumber must be a positive integer." };
  }

  if (dismissed) {
    return {
      valid: true,
      data: { sessionId, sessionNumber, dismissed: true, responses: null },
    };
  }

  if (!responses || typeof responses !== "object") {
    return { valid: false, reason: "responses object is required when not dismissed." };
  }

  for (const key of SCALE_KEYS) {
    if (!(key in responses)) {
      return { valid: false, reason: `Missing scale: ${key}.` };
    }
    if (!isValidRating(responses[key])) {
      return {
        valid: false,
        reason: `${key} must be an integer between 1 and 20.`,
      };
    }
  }

  const cleaned = {};
  for (const key of SCALE_KEYS) {
    cleaned[key] = responses[key];
  }

  return {
    valid: true,
    data: { sessionId, sessionNumber, dismissed: false, responses: cleaned },
  };
}
