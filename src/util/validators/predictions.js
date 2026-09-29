/**
 * Prediction file validation for the retraining pipeline. Validates model
 * version format, box geometry/category/confidence, and converts prediction
 * boxes to the annotation format the UI expects.
 */
import { TAXONOMY_SET } from "@/util/taxonomy";

export const VALID_VERSION_PATTERN = /^v\d+-\w[\w-]*$/;

export function validateModelVersion(version) {
  if (typeof version !== "string" || !VALID_VERSION_PATTERN.test(version)) {
    return { valid: false, error: `Invalid model version "${version}". Expected format: v<number>-<name> (e.g. v1-retrained, v2-xgboost)` };
  }
  return { valid: true };
}

export function validatePredictionBox(box, index) {
  if (!box || typeof box !== "object") {
    return { valid: false, error: `Box at index ${index} is not an object` };
  }

  const { x, y, width, height, category, confidence } = box;

  if (typeof x !== "number" || typeof y !== "number" ||
      typeof width !== "number" || typeof height !== "number") {
    return { valid: false, error: `Box at index ${index} has non-numeric geometry` };
  }

  if (width <= 0 || height <= 0) {
    return { valid: false, error: `Box at index ${index} has non-positive dimensions` };
  }

  if (typeof category !== "string" || category.length === 0) {
    return { valid: false, error: `Box at index ${index} has missing or empty category` };
  }

  if (!TAXONOMY_SET.has(category)) {
    return { valid: false, error: `Box at index ${index} has unknown category "${category}". Must be one of the 18 taxonomy categories.` };
  }

  if (confidence !== undefined && confidence !== null) {
    if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
      return { valid: false, error: `Box at index ${index} has confidence outside [0, 1]` };
    }
  }

  return { valid: true };
}

export function validatePredictionEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    return { valid: false, error: `Entry at index ${index} is not an object` };
  }

  const { imageID, boxes } = entry;

  if (imageID === undefined || imageID === null) {
    return { valid: false, error: `Entry at index ${index} is missing imageID` };
  }

  if (!Array.isArray(boxes)) {
    return { valid: false, error: `Entry at index ${index} has non-array boxes` };
  }

  for (let i = 0; i < boxes.length; i++) {
    const result = validatePredictionBox(boxes[i], i);
    if (!result.valid) {
      return { valid: false, error: `Entry ${index} (imageID=${imageID}): ${result.error}` };
    }
  }

  return { valid: true };
}

export function validatePredictionsPayload(data) {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Predictions payload must be an object" };
  }

  const { modelVersion, predictions } = data;

  const versionResult = validateModelVersion(modelVersion);
  if (!versionResult.valid) return versionResult;

  if (!Array.isArray(predictions)) {
    return { valid: false, error: "predictions must be an array" };
  }

  if (predictions.length === 0) {
    return { valid: false, error: "predictions array is empty" };
  }

  const seenImageIDs = new Set();
  for (let i = 0; i < predictions.length; i++) {
    const result = validatePredictionEntry(predictions[i], i);
    if (!result.valid) return result;

    const id = predictions[i].imageID;
    if (seenImageIDs.has(id)) {
      return { valid: false, error: `Duplicate imageID ${id} at entry ${i}` };
    }
    seenImageIDs.add(id);
  }

  return { valid: true };
}

export function predictionBoxToAnnotation(box, index) {
  return {
    id: `pred-${index}`,
    comment: box.category,
    mark: { x: box.x, y: box.y, width: box.width, height: box.height },
    editable: false,
    selected: false,
    confidence: box.confidence ?? null,
  };
}
