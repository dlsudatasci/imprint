import { describe, it, expect } from "vitest";
import {
  shouldShowNasaTlx,
  validateNasaTlxPayload,
  NASA_TLX_SCALES,
} from "./nasaTlx.js";

const VALID_SESSION_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";

function validSubmission(overrides = {}) {
  return {
    sessionId: VALID_SESSION_ID,
    sessionNumber: 1,
    dismissed: false,
    responses: {
      mentalDemand: 10,
      physicalDemand: 5,
      temporalDemand: 8,
      performance: 12,
      effort: 9,
      frustration: 3,
    },
    ...overrides,
  };
}

function validDismissal(overrides = {}) {
  return {
    sessionId: VALID_SESSION_ID,
    sessionNumber: 1,
    dismissed: true,
    ...overrides,
  };
}

describe("NASA_TLX_SCALES", () => {
  it("has exactly 6 scales", () => {
    expect(NASA_TLX_SCALES).toHaveLength(6);
  });

  it("each scale has key, label, description, lowLabel, highLabel", () => {
    for (const scale of NASA_TLX_SCALES) {
      expect(scale).toHaveProperty("key");
      expect(scale).toHaveProperty("label");
      expect(scale).toHaveProperty("description");
      expect(scale).toHaveProperty("lowLabel");
      expect(scale).toHaveProperty("highLabel");
    }
  });
});

describe("shouldShowNasaTlx", () => {
  it("returns true for session 1", () => {
    expect(shouldShowNasaTlx(1)).toBe(true);
  });

  it("returns false for session 2", () => {
    expect(shouldShowNasaTlx(2)).toBe(false);
  });

  it("returns true for session 3", () => {
    expect(shouldShowNasaTlx(3)).toBe(true);
  });

  it("returns false for sessions 4, 5, 6, 7", () => {
    expect(shouldShowNasaTlx(4)).toBe(false);
    expect(shouldShowNasaTlx(5)).toBe(false);
    expect(shouldShowNasaTlx(6)).toBe(false);
    expect(shouldShowNasaTlx(7)).toBe(false);
  });

  it("returns true for session 8 (first after-3 trigger)", () => {
    expect(shouldShowNasaTlx(8)).toBe(true);
  });

  it("returns true for session 13", () => {
    expect(shouldShowNasaTlx(13)).toBe(true);
  });

  it("returns true for session 18", () => {
    expect(shouldShowNasaTlx(18)).toBe(true);
  });

  it("returns true for session 23", () => {
    expect(shouldShowNasaTlx(23)).toBe(true);
  });

  it("returns false for session 10", () => {
    expect(shouldShowNasaTlx(10)).toBe(false);
  });

  it("returns false for 0, negative, non-integer", () => {
    expect(shouldShowNasaTlx(0)).toBe(false);
    expect(shouldShowNasaTlx(-1)).toBe(false);
    expect(shouldShowNasaTlx(1.5)).toBe(false);
    expect(shouldShowNasaTlx(null)).toBe(false);
    expect(shouldShowNasaTlx(undefined)).toBe(false);
  });
});

describe("validateNasaTlxPayload", () => {
  it("accepts a valid submission", () => {
    const result = validateNasaTlxPayload(validSubmission());
    expect(result.valid).toBe(true);
    expect(result.data.dismissed).toBe(false);
    expect(result.data.responses).toHaveProperty("mentalDemand", 10);
  });

  it("accepts a valid dismissal", () => {
    const result = validateNasaTlxPayload(validDismissal());
    expect(result.valid).toBe(true);
    expect(result.data.dismissed).toBe(true);
    expect(result.data.responses).toBeNull();
  });

  it("dismissal ignores partial responses", () => {
    const result = validateNasaTlxPayload(
      validDismissal({ responses: { mentalDemand: 50 } })
    );
    expect(result.valid).toBe(true);
    expect(result.data.responses).toBeNull();
  });

  it("rejects null body", () => {
    expect(validateNasaTlxPayload(null).valid).toBe(false);
  });

  it("rejects non-object body", () => {
    expect(validateNasaTlxPayload("string").valid).toBe(false);
  });

  it("rejects invalid sessionId (too short)", () => {
    const result = validateNasaTlxPayload(validSubmission({ sessionId: "abc" }));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/sessionId/);
  });

  it("rejects invalid sessionId (non-hex)", () => {
    const result = validateNasaTlxPayload(
      validSubmission({ sessionId: "zzzzzzzzzzzzzzzzzzzzzzzz" })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects non-boolean dismissed", () => {
    const result = validateNasaTlxPayload(validSubmission({ dismissed: "no" }));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/dismissed/);
  });

  it("rejects missing sessionNumber", () => {
    const body = validSubmission();
    delete body.sessionNumber;
    expect(validateNasaTlxPayload(body).valid).toBe(false);
  });

  it("rejects non-integer sessionNumber", () => {
    expect(
      validateNasaTlxPayload(validSubmission({ sessionNumber: 1.5 })).valid
    ).toBe(false);
  });

  it("rejects zero sessionNumber", () => {
    expect(
      validateNasaTlxPayload(validSubmission({ sessionNumber: 0 })).valid
    ).toBe(false);
  });

  it("rejects missing responses when not dismissed", () => {
    const body = validSubmission();
    delete body.responses;
    expect(validateNasaTlxPayload(body).valid).toBe(false);
  });

  it("rejects missing scale key", () => {
    const body = validSubmission();
    delete body.responses.frustration;
    const result = validateNasaTlxPayload(body);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/frustration/);
  });

  it("rejects value out of range (zero)", () => {
    const body = validSubmission();
    body.responses.mentalDemand = 0;
    expect(validateNasaTlxPayload(body).valid).toBe(false);
  });

  it("rejects value out of range (over 20)", () => {
    const body = validSubmission();
    body.responses.mentalDemand = 21;
    expect(validateNasaTlxPayload(body).valid).toBe(false);
  });

  it("rejects non-integer value", () => {
    const body = validSubmission();
    body.responses.mentalDemand = 5.5;
    expect(validateNasaTlxPayload(body).valid).toBe(false);
  });

  it("rejects non-number value", () => {
    const body = validSubmission();
    body.responses.mentalDemand = "fifty";
    expect(validateNasaTlxPayload(body).valid).toBe(false);
  });

  it("accepts boundary values 1 and 20", () => {
    const body = validSubmission();
    body.responses.mentalDemand = 1;
    body.responses.physicalDemand = 20;
    expect(validateNasaTlxPayload(body).valid).toBe(true);
  });

  it("strips extra keys from responses", () => {
    const body = validSubmission();
    body.responses.extraField = 999;
    const result = validateNasaTlxPayload(body);
    expect(result.valid).toBe(true);
    expect(result.data.responses).not.toHaveProperty("extraField");
  });
});
