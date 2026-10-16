import { describe, it, expect } from "vitest";
import {
  MODEL_VERSION_PATTERN,
  PROPOSAL_FIELDS,
  validatePredictionFile,
  planPredictionUpdate,
  updateOperation,
} from "./predictionUpdate.mjs";
import { MODEL_VERSION_PATTERN as IMPORT_VERSION_PATTERN } from "./imageImport.mjs";

/**
 * update-predictions.mjs writes only the classifier's proposals onto the
 * suggestions images already have (16 Oct 2026). The detector's boxes, ids and
 * categories never change (chapter_4.tex and chapter_5.tex), the whole served
 * pool is covered, and nothing is written while any check fails.
 */
const rect = (x) => ({ type: "RECT", x, y: 10, width: 20, height: 40 });
const box = (id, comment, extra = {}) => ({ id, comment, mark: rect(10), selected: false, editable: false, isRejected: false, ...extra });

const IMAGES = [
  { imageID: 1, modelVersion: "v0-mapillary", poolStatus: "served", annotationList: [box("mly-0", "car"), box("mly-1", "tree", { confidence: 0.9 })] },
  { imageID: 2, modelVersion: "v0-mapillary", poolStatus: "served", annotationList: [] },
  { imageID: 3, modelVersion: "v0-mapillary", poolStatus: "reserve", annotationList: [box("atlas-0", "utility_post")] },
];

const file = (overrides = {}) => ({
  modelVersion: "v1-xgboost",
  decisionThreshold: 0.5,
  predictions: [
    { imageID: 1, proposals: [{ boxId: "mly-0", obstructs: false, probability: 0.2 }, { boxId: "mly-1", obstructs: true, probability: 0.8 }] },
    { imageID: 2, proposals: [] },
  ],
  ...overrides,
});

describe("validatePredictionFile", () => {
  it("accepts a well-formed file", () => {
    expect(validatePredictionFile(file())).toEqual([]);
  });

  it("uses the same version format as the image import", () => {
    expect(MODEL_VERSION_PATTERN.source).toBe(IMPORT_VERSION_PATTERN.source);
  });

  it("refuses a bad version, threshold, or empty list", () => {
    expect(validatePredictionFile(null)).toEqual(["the file must hold one JSON object"]);
    expect(validatePredictionFile(file({ modelVersion: "retrained" })).join(" ")).toContain("modelVersion");
    expect(validatePredictionFile(file({ decisionThreshold: 1.2 })).join(" ")).toContain("decisionThreshold");
    expect(validatePredictionFile(file({ decisionThreshold: undefined })).join(" ")).toContain("decisionThreshold");
    expect(validatePredictionFile(file({ predictions: [] })).join(" ")).toContain("non-empty");
  });

  it("refuses boxes: the detector's boxes are never rewritten", () => {
    const old = { modelVersion: "v1-retrained", decisionThreshold: 0.5, predictions: [{ imageID: 1, boxes: [{ x: 1, y: 1, width: 5, height: 5, category: "tree" }] }] };
    expect(validatePredictionFile(old).join(" ")).toContain("boxes are not accepted");
  });

  it("refuses a bad imageID, a repeated image, and a repeated box", () => {
    const bad = file({
      predictions: [
        { imageID: "1", proposals: [] },
        { imageID: 2, proposals: [] },
        { imageID: 2, proposals: [] },
        { imageID: 4, proposals: [{ boxId: "a", obstructs: false, probability: 0.1 }, { boxId: "a", obstructs: false, probability: 0.1 }] },
      ],
    });
    const text = validatePredictionFile(bad).join(" | ");
    expect(text).toContain("predictions[0]: imageID must be a positive whole number");
    expect(text).toContain("imageID 2 appears twice");
    expect(text).toContain("box a has two proposals");
  });

  it("refuses a proposal without a boolean answer or a probability from 0 to 1", () => {
    const bad = file({ predictions: [{ imageID: 1, proposals: [{ boxId: "mly-0", obstructs: "yes", probability: 0.2 }, { boxId: "mly-1", obstructs: true, probability: 81 }, { obstructs: true, probability: 0.9 }] }] });
    const text = validatePredictionFile(bad).join(" | ");
    expect(text).toContain("obstructs must be true or false");
    expect(text).toContain("probability must be a number from 0 to 1");
    expect(text).toContain("boxId must be a non-empty string");
  });

  it("refuses an answer that disagrees with the decision threshold, and accepts one exactly at it", () => {
    const wrong = file({ predictions: [{ imageID: 1, proposals: [{ boxId: "mly-0", obstructs: true, probability: 0.49 }] }] });
    expect(validatePredictionFile(wrong).join(" ")).toContain("below the threshold 0.5");
    const atIt = file({ predictions: [{ imageID: 1, proposals: [{ boxId: "mly-0", obstructs: true, probability: 0.5 }] }] });
    expect(validatePredictionFile(atIt)).toEqual([]);
  });
});

describe("planPredictionUpdate", () => {
  it("adds the proposal to each suggestion and changes nothing else about it", () => {
    const before = JSON.stringify(IMAGES);
    const { problems, updates, counts } = planPredictionUpdate(file(), IMAGES);
    expect(problems).toEqual([]);
    expect(JSON.stringify(IMAGES)).toBe(before);
    const one = updates.find((u) => u.imageID === 1);
    expect(one.fromVersion).toBe("v0-mapillary");
    expect(one.suggestionIds).toEqual(["mly-0", "mly-1"]);
    expect(one.annotationList).toEqual([
      { ...IMAGES[0].annotationList[0], [PROPOSAL_FIELDS.obstructs]: false, [PROPOSAL_FIELDS.probability]: 0.2 },
      { ...IMAGES[0].annotationList[1], [PROPOSAL_FIELDS.obstructs]: true, [PROPOSAL_FIELDS.probability]: 0.8 },
    ]);
    // An image with no suggestions still moves to the new version
    expect(updates.find((u) => u.imageID === 2).annotationList).toEqual([]);
    expect(counts).toEqual({ imagesInFile: 2, imagesUpdated: 2, imagesSkippedSameVersion: 0, proposalsWritten: 2, imagesNotServed: 0, servedImagesNotInFile: 0 });
  });

  it("names the fields proposedObstructs and obstructionProbability", () => {
    expect(PROPOSAL_FIELDS).toEqual({ obstructs: "proposedObstructs", probability: "obstructionProbability" });
  });

  it("refuses an image that does not exist, a box it does not have, and a suggestion left without a proposal", () => {
    const f = file({
      predictions: [
        { imageID: 1, proposals: [{ boxId: "mly-0", obstructs: false, probability: 0.2 }, { boxId: "pred-0", obstructs: false, probability: 0.1 }] },
        { imageID: 2, proposals: [] },
        { imageID: 99, proposals: [] },
      ],
    });
    const { problems } = planPredictionUpdate(f, IMAGES);
    expect(problems).toContain("imageID 99 is not in the Image collection");
    expect(problems).toContain("imageID 1: box pred-0 is not one of its suggestions");
    expect(problems).toContain("imageID 1: suggestion mly-1 has no proposal");
  });

  it("refuses a file that leaves out an image served to contributors, unless partial runs are allowed", () => {
    const f = file({ predictions: [file().predictions[0]] });
    const { problems, counts } = planPredictionUpdate(f, IMAGES);
    expect(problems.join(" ")).toContain("1 image(s) served to contributors are not in the file (2)");
    expect(counts.servedImagesNotInFile).toBe(1);
    expect(planPredictionUpdate(f, IMAGES, { allowPartial: true }).problems).toEqual([]);
  });

  it("accepts images not served to contributors, and counts them", () => {
    const f = file({ predictions: [...file().predictions, { imageID: 3, proposals: [{ boxId: "atlas-0", obstructs: false, probability: 0.3 }] }] });
    const { problems, counts } = planPredictionUpdate(f, IMAGES);
    expect(problems).toEqual([]);
    expect(counts.imagesNotServed).toBe(1);
  });

  it("skips images already at this version, unless forced, so a stopped run can be run again", () => {
    const images = IMAGES.map((img) => (img.imageID === 1 ? { ...img, modelVersion: "v1-xgboost" } : img));
    const skipped = planPredictionUpdate(file(), images);
    expect(skipped.updates.map((u) => u.imageID)).toEqual([2]);
    expect(skipped.counts.imagesSkippedSameVersion).toBe(1);
    expect(planPredictionUpdate(file(), images, { force: true }).updates.map((u) => u.imageID)).toEqual([1, 2]);
  });

  it("treats an image with no modelVersion as version null", () => {
    const images = IMAGES.map((img) => (img.imageID === 2 ? { ...img, modelVersion: undefined } : img));
    expect(planPredictionUpdate(file(), images).updates.find((u) => u.imageID === 2).fromVersion).toBeNull();
  });
});

describe("updateOperation", () => {
  it("writes the new list, version and time only while the image still has the version and the suggestions it was planned from", () => {
    const { updates } = planPredictionUpdate(file(), IMAGES);
    const now = new Date("2026-11-01T00:00:00Z");
    const op = updateOperation(updates[0], "v1-xgboost", now);
    expect(op.updateOne.filter).toEqual({
      imageID: 1,
      modelVersion: "v0-mapillary",
      annotationList: { $size: 2 },
      "annotationList.id": { $all: ["mly-0", "mly-1"] },
    });
    expect(op.updateOne.update).toEqual({ $set: { annotationList: updates[0].annotationList, modelVersion: "v1-xgboost", predictionUpdatedAt: now } });
    // No suggestions: no id condition
    expect(updateOperation(updates[1], "v1-xgboost", now).updateOne.filter).toEqual({ imageID: 2, modelVersion: "v0-mapillary", annotationList: { $size: 0 } });
  });
});
