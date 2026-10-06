import { describe, it, expect } from "vitest";
import {
  validateModelVersion,
  validatePredictionBox,
  validatePredictionEntry,
  validatePredictionsPayload,
  predictionBoxToAnnotation,
  VALID_VERSION_PATTERN,
} from "./predictions.js";

const validBox = { x: 10, y: 20, width: 50, height: 60, category: "tree", confidence: 0.85 };

describe("VALID_VERSION_PATTERN", () => {
  it("matches valid versions", () => {
    expect(VALID_VERSION_PATTERN.test("v0-mapillary")).toBe(true);
    expect(VALID_VERSION_PATTERN.test("v1-retrained")).toBe(true);
    expect(VALID_VERSION_PATTERN.test("v12-xgboost-v2")).toBe(true);
  });

  it("rejects invalid versions", () => {
    expect(VALID_VERSION_PATTERN.test("mapillary")).toBe(false);
    expect(VALID_VERSION_PATTERN.test("v-nope")).toBe(false);
    expect(VALID_VERSION_PATTERN.test("")).toBe(false);
  });
});

describe("validateModelVersion", () => {
  it("accepts valid version strings", () => {
    expect(validateModelVersion("v0-mapillary").valid).toBe(true);
    expect(validateModelVersion("v3-retrained").valid).toBe(true);
  });

  it("rejects non-string input", () => {
    expect(validateModelVersion(123).valid).toBe(false);
    expect(validateModelVersion(null).valid).toBe(false);
  });

  it("rejects malformed version strings", () => {
    expect(validateModelVersion("bad").valid).toBe(false);
    expect(validateModelVersion("v-nope").valid).toBe(false);
  });
});

describe("validatePredictionBox", () => {
  it("accepts a valid box", () => {
    expect(validatePredictionBox(validBox, 0).valid).toBe(true);
  });

  it("accepts a box without confidence", () => {
    const noConf = { x: 10, y: 20, width: 50, height: 60, category: "tree" };
    expect(validatePredictionBox(noConf, 0).valid).toBe(true);
  });

  it("rejects non-object", () => {
    expect(validatePredictionBox(null, 0).valid).toBe(false);
    expect(validatePredictionBox("string", 1).valid).toBe(false);
  });

  it("rejects non-numeric geometry", () => {
    expect(validatePredictionBox({ ...validBox, x: "10" }, 0).valid).toBe(false);
  });

  it("rejects non-positive dimensions", () => {
    expect(validatePredictionBox({ ...validBox, width: 0 }, 0).valid).toBe(false);
    expect(validatePredictionBox({ ...validBox, height: -5 }, 0).valid).toBe(false);
  });

  it("rejects missing category", () => {
    expect(validatePredictionBox({ ...validBox, category: "" }, 0).valid).toBe(false);
    expect(validatePredictionBox({ ...validBox, category: undefined }, 0).valid).toBe(false);
  });

  it("rejects non-taxonomy category", () => {
    expect(validatePredictionBox({ ...validBox, category: "banana" }, 0).valid).toBe(false);
  });

  it("rejects out-of-range confidence", () => {
    expect(validatePredictionBox({ ...validBox, confidence: 1.5 }, 0).valid).toBe(false);
    expect(validatePredictionBox({ ...validBox, confidence: -0.1 }, 0).valid).toBe(false);
  });
});

describe("validatePredictionEntry", () => {
  it("accepts a valid entry", () => {
    const entry = { imageID: 42, boxes: [validBox] };
    expect(validatePredictionEntry(entry, 0).valid).toBe(true);
  });

  it("accepts entry with empty boxes array", () => {
    const entry = { imageID: 42, boxes: [] };
    expect(validatePredictionEntry(entry, 0).valid).toBe(true);
  });

  it("rejects missing imageID", () => {
    expect(validatePredictionEntry({ boxes: [] }, 0).valid).toBe(false);
  });

  it("rejects non-array boxes", () => {
    expect(validatePredictionEntry({ imageID: 42, boxes: "bad" }, 0).valid).toBe(false);
  });

  it("rejects entry with invalid box", () => {
    const entry = { imageID: 42, boxes: [{ ...validBox, width: -1 }] };
    expect(validatePredictionEntry(entry, 0).valid).toBe(false);
  });
});

describe("validatePredictionsPayload", () => {
  const validPayload = {
    modelVersion: "v1-retrained",
    predictions: [
      { imageID: 1, boxes: [validBox] },
      { imageID: 2, boxes: [] },
    ],
  };

  it("accepts a valid payload", () => {
    expect(validatePredictionsPayload(validPayload).valid).toBe(true);
  });

  it("rejects null payload", () => {
    expect(validatePredictionsPayload(null).valid).toBe(false);
  });

  it("rejects invalid model version", () => {
    expect(validatePredictionsPayload({ ...validPayload, modelVersion: "bad" }).valid).toBe(false);
  });

  it("rejects non-array predictions", () => {
    expect(validatePredictionsPayload({ ...validPayload, predictions: {} }).valid).toBe(false);
  });

  it("rejects empty predictions", () => {
    expect(validatePredictionsPayload({ ...validPayload, predictions: [] }).valid).toBe(false);
  });

  it("rejects duplicate imageIDs", () => {
    const dup = {
      modelVersion: "v1-retrained",
      predictions: [
        { imageID: 1, boxes: [validBox] },
        { imageID: 1, boxes: [] },
      ],
    };
    expect(validatePredictionsPayload(dup).valid).toBe(false);
    expect(validatePredictionsPayload(dup).error).toContain("Duplicate");
  });

  it("surfaces nested box validation errors", () => {
    const bad = {
      modelVersion: "v1-retrained",
      predictions: [{ imageID: 1, boxes: [{ ...validBox, category: "bad" }] }],
    };
    const result = validatePredictionsPayload(bad);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("unknown category");
  });
});

describe("predictionBoxToAnnotation", () => {
  it("converts a prediction box to the annotation format", () => {
    const result = predictionBoxToAnnotation(validBox, 3);
    expect(result).toEqual({
      id: "pred-3",
      comment: "tree",
      mark: { x: 10, y: 20, width: 50, height: 60 },
      editable: false,
      selected: false,
      confidence: 0.85,
    });
  });

  it("defaults confidence to null when absent", () => {
    const noConf = { x: 10, y: 20, width: 50, height: 60, category: "tree" };
    const result = predictionBoxToAnnotation(noConf, 0);
    expect(result.confidence).toBeNull();
  });
});
