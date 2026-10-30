import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createMockCollection, createMockDb } from "@/test-utils/api-helpers";
import { TAXONOMY_CATEGORIES } from "@/util/taxonomy";
import {
  DETECTOR_POOL_STATUSES,
  EDGE_TOLERANCE_PX,
  IMAGE_PROJECTION,
  validateDetectorBoxesFile,
  toStoredSuggestion,
  readDetectorBoxesState,
  planDetectorBoxes,
  detectorBoxesOperation,
  tauReminder,
  runDetectorBoxes,
} from "./detectorBoxes.mjs";

/**
 * write-detector-boxes.mjs puts the frozen detector's boxes on every served
 * and reserve image once, before the first contributor (S1, 30 Oct 2026),
 * and keeps the Step 3 suggestions in step3AnnotationList. Nothing is written
 * while any check fails or any session is active.
 */
const rect = (x, extra = {}) => ({ type: "RECT", x, y: 10, width: 20, height: 40, ...extra });
const step3Box = (id, comment) => ({ id, comment, mark: rect(10), selected: false, editable: false, isRejected: false });
const det = (id, comment, confidence, mark = { x: 300.5, y: 10, width: 20, height: 200, type: "RECT" }) => ({ id, comment, mark, confidence });

const IMAGES = [
  { imageID: 1, poolStatus: "served", width: 640, height: 360, modelVersion: "v0-mapillary", annotationList: [step3Box("mly-0", "car"), step3Box("mly-1", "tree")] },
  { imageID: 2, poolStatus: "served", width: 640, height: 360, modelVersion: "v0-atlas3", annotationList: [] },
  { imageID: 3, poolStatus: "reserve", width: 640, height: 360, modelVersion: "v0-mapillary", annotationList: [step3Box("mly-0", "bench")] },
];

const file = (overrides = {}) => ({
  detectorVersion: "det-v1-rfdetr-medium",
  segmenterVersion: "seg-v1-deeplabv3plus-r101",
  modelVersion: "v0-det-rfdetr-medium",
  tau: 0.5,
  storageFloor: 0.1,
  boxesSha256: "abc123",
  images: [
    { imageID: 1, imageName: "a.jpg", width: 640, height: 360, suggestions: [det("det-0", "utility_post", 0.91), det("det-1", "car", 0.2)] },
    { imageID: 2, imageName: "b.jpg", width: 640, height: 360, suggestions: [] },
    { imageID: 3, imageName: "c.jpg", width: 640, height: 360, suggestions: [det("det-0", "tree", 0.5)] },
  ],
  ...overrides,
});

/** The file with one suggestion of image 1 replaced */
const withSuggestion = (s) => file({ images: [{ ...file().images[0], suggestions: [s] }, ...file().images.slice(1)] });

describe("validateDetectorBoxesFile", () => {
  it("accepts a well-formed file", () => {
    expect(validateDetectorBoxesFile(file())).toEqual([]);
  });

  it("checks categories against the eighteen-class taxonomy", () => {
    for (const comment of TAXONOMY_CATEGORIES) {
      expect(validateDetectorBoxesFile(withSuggestion(det("det-0", comment, 0.5)))).toEqual([]);
    }
    for (const comment of ["person", "Car", "", undefined, "other"]) {
      expect(validateDetectorBoxesFile(withSuggestion(det("det-0", comment, 0.5))).join(" ")).toContain("is not one of the eighteen categories");
    }
  });

  it("refuses something other than one object", () => {
    for (const bad of [null, [], "x", 3]) {
      expect(validateDetectorBoxesFile(bad)).toEqual(["the file must hold one JSON object"]);
    }
  });

  it("requires non-empty detector and segmenter versions", () => {
    for (const v of [undefined, "", "   ", 3]) {
      expect(validateDetectorBoxesFile(file({ detectorVersion: v })).join(" ")).toContain("detectorVersion must be a non-empty string");
      expect(validateDetectorBoxesFile(file({ segmenterVersion: v })).join(" ")).toContain("segmenterVersion must be a non-empty string");
    }
  });

  it("requires a modelVersion that fits the version format and starts with v0-", () => {
    for (const v of ["v1-xgboost", "det-v1-rfdetr-medium", "v0-", "v0 det", undefined]) {
      expect(validateDetectorBoxesFile(file({ modelVersion: v })).join(" ")).toContain("modelVersion");
    }
    expect(validateDetectorBoxesFile(file({ modelVersion: "v0-det" }))).toEqual([]);
  });

  it("requires tau and storageFloor from 0 to 1", () => {
    for (const v of [-0.1, 1.2, "0.5", NaN, undefined]) {
      expect(validateDetectorBoxesFile(file({ tau: v })).join(" ")).toContain("tau must be a number from 0 to 1");
      expect(validateDetectorBoxesFile(file({ storageFloor: v })).join(" ")).toContain("storageFloor must be a number from 0 to 1");
    }
    expect(validateDetectorBoxesFile(file({ tau: 0, storageFloor: 0 }))).toEqual([]);
    expect(validateDetectorBoxesFile(file({ tau: 1 }))).toEqual([]);
  });

  it("requires a non-empty images array", () => {
    expect(validateDetectorBoxesFile(file({ images: [] })).join(" ")).toContain("images must be a non-empty array");
    expect(validateDetectorBoxesFile(file({ images: undefined })).join(" ")).toContain("images must be a non-empty array");
  });

  it("refuses an image that is not an object, a non-integer or repeated imageID", () => {
    const bad = file({
      images: [
        null,
        { imageID: "1", width: 640, height: 360, suggestions: [] },
        { imageID: 1.5, width: 640, height: 360, suggestions: [] },
        { imageID: 2, width: 640, height: 360, suggestions: [] },
        { imageID: 2, width: 640, height: 360, suggestions: [] },
      ],
    });
    const text = validateDetectorBoxesFile(bad).join(" | ");
    expect(text).toContain("images[0] is not an object");
    expect(text).toContain("images[1]: imageID must be a whole number");
    expect(text).toContain("images[2]: imageID must be a whole number");
    expect(text).toContain("images[4]: imageID 2 appears twice");
  });

  it("requires a positive width and height and a suggestions array", () => {
    for (const [width, height] of [[0, 360], [640, -1], [undefined, 360], ["640", 360]]) {
      const bad = file({ images: [{ imageID: 1, width, height, suggestions: [] }] });
      expect(validateDetectorBoxesFile(bad).join(" ")).toContain("width and height must be positive numbers");
    }
    const noList = file({ images: [{ imageID: 1, width: 640, height: 360 }] });
    expect(validateDetectorBoxesFile(noList).join(" ")).toContain("suggestions must be an array");
  });

  it("requires each suggestion to be an object with an id unique in its image", () => {
    const bad = file({
      images: [
        { imageID: 1, width: 640, height: 360, suggestions: [null, det("", "car", 0.5), det("a", "car", 0.5), det("a", "car", 0.5)] },
        // The same id on another image is fine
        { imageID: 2, width: 640, height: 360, suggestions: [det("a", "car", 0.5)] },
      ],
    });
    const problems = validateDetectorBoxesFile(bad);
    const text = problems.join(" | ");
    expect(text).toContain("suggestions[0] is not an object");
    expect(text).toContain("suggestions[1]: id must be a non-empty string");
    expect(text).toContain("suggestions[3]: id a appears twice in this image");
    expect(problems.some((p) => p.includes("imageID 2"))).toBe(false);
  });

  it("requires a RECT mark with finite x and y and positive width and height", () => {
    const marks = [
      null,
      "RECT",
      { x: 1, y: 1, width: 5, height: 5, type: "POLYGON" },
      { x: Infinity, y: 1, width: 5, height: 5, type: "RECT" },
      { x: 1, y: "1", width: 5, height: 5, type: "RECT" },
      { x: 1, y: 1, width: 0, height: 5, type: "RECT" },
      { x: 1, y: 1, width: 5, height: -5, type: "RECT" },
    ];
    for (const mark of marks) {
      expect(validateDetectorBoxesFile(withSuggestion(det("det-0", "car", 0.5, mark))).join(" ")).toMatch(/mark must/);
    }
  });

  it("refuses a mark outside the image, with a tolerance of half a pixel", () => {
    expect(EDGE_TOLERANCE_PX).toBe(0.5);
    const ok = [
      { x: -0.5, y: -0.5, width: 10, height: 10, type: "RECT" },
      { x: 620.5, y: 0, width: 20, height: 360.5, type: "RECT" },
    ];
    for (const mark of ok) expect(validateDetectorBoxesFile(withSuggestion(det("det-0", "car", 0.5, mark)))).toEqual([]);
    const outside = [
      { x: -0.6, y: 0, width: 10, height: 10, type: "RECT" },
      { x: 0, y: -0.51, width: 10, height: 10, type: "RECT" },
      { x: 620.6, y: 0, width: 20, height: 10, type: "RECT" },
      { x: 0, y: 300, width: 10, height: 60.6, type: "RECT" },
    ];
    for (const mark of outside) {
      expect(validateDetectorBoxesFile(withSuggestion(det("det-0", "car", 0.5, mark))).join(" ")).toContain("mark lies outside the 640x360 image");
    }
  });

  it("requires a confidence from the storage floor to 1", () => {
    for (const c of [1.01, -0.2, "0.9", undefined, NaN]) {
      expect(validateDetectorBoxesFile(withSuggestion(det("det-0", "car", c))).join(" ")).toContain("confidence must be a number from 0 to 1");
    }
    expect(validateDetectorBoxesFile(withSuggestion(det("det-0", "car", 0.09))).join(" ")).toContain("confidence 0.09 is below the storage floor 0.1");
    expect(validateDetectorBoxesFile(withSuggestion(det("det-0", "car", 0.1)))).toEqual([]);
    expect(validateDetectorBoxesFile(withSuggestion(det("det-0", "car", 1)))).toEqual([]);
  });

  it("names images by index and imageID only, with no em dashes or semicolons", () => {
    const bad = withSuggestion(det("det-0", "person", 2, { x: -5, y: 0, width: 1, height: 1, type: "RECT" }));
    for (const p of validateDetectorBoxesFile(bad)) {
      expect(p).toMatch(/^images\[0\] \(imageID 1\) suggestions\[0\]/);
      expect(p).not.toMatch(/[—;]/);
    }
  });
});

describe("toStoredSuggestion", () => {
  it("stores id, comment, mark and confidence, unselected, not editable and not rejected", () => {
    const s = det("det-0", "car", 0.7, { x: 1, y: 2, width: 3, height: 4, type: "RECT", extra: "dropped" });
    expect(toStoredSuggestion(s)).toEqual({
      id: "det-0",
      comment: "car",
      mark: { x: 1, y: 2, width: 3, height: 4, type: "RECT" },
      confidence: 0.7,
      selected: false,
      editable: false,
      isRejected: false,
    });
  });
});

describe("readDetectorBoxesState", () => {
  it("reads the file's images and every served and reserve image with only the fields it needs, and the contributor-answered ids", async () => {
    const images = createMockCollection({
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([...IMAGES, { imageID: 9, poolStatus: "served" }]) }),
    });
    const annotations = createMockCollection({ distinct: vi.fn().mockResolvedValue([2]) });
    const db = createMockDb({ Image: images, annotations });
    const state = await readDetectorBoxesState(db, file());
    expect(DETECTOR_POOL_STATUSES).toEqual(["served", "reserve"]);
    expect(images.find).toHaveBeenCalledWith(
      { $or: [{ imageID: { $in: [1, 2, 3] } }, { poolStatus: { $in: ["served", "reserve"] } }] },
      { projection: IMAGE_PROJECTION }
    );
    expect(Object.keys(IMAGE_PROJECTION).sort()).toEqual(["annotationList", "detectorVersion", "height", "imageID", "modelVersion", "poolStatus", "step3AnnotationList", "width"]);
    expect(annotations.distinct).toHaveBeenCalledWith("imageID", { imageID: { $in: [1, 2, 3, 9] }, source: "contributor" });
    expect(state.answeredImageIDs).toEqual([2]);
    expect(state.images).toHaveLength(4);
  });
});

describe("planDetectorBoxes", () => {
  it("plans every image with the file's suggestions and keeps the old annotationList as it is", () => {
    const before = JSON.stringify(IMAGES);
    const { problems, updates, counts } = planDetectorBoxes(file(), IMAGES, []);
    expect(problems).toEqual([]);
    expect(JSON.stringify(IMAGES)).toBe(before);
    expect(updates.map((u) => u.imageID)).toEqual([1, 2, 3]);
    const one = updates[0];
    expect(one.fromVersion).toBe("v0-mapillary");
    expect(one.fromList).toBe(IMAGES[0].annotationList);
    expect(one.annotationList).toEqual(file().images[0].suggestions.map(toStoredSuggestion));
    expect(counts).toEqual({
      imagesInFile: 3,
      imagesInFileByPoolStatus: { served: 2, reserve: 1 },
      currentModelVersions: { "v0-mapillary": 2, "v0-atlas3": 1 },
      imagesToWrite: 3,
      suggestionsToWrite: 3,
      // 0.91 and 0.5 are at or above tau 0.5, 0.2 is not
      suggestionsAtOrAboveTau: 2,
      imagesSkippedAlreadyWritten: 0,
      imagesSkippedAnswered: 0,
      poolImagesNotInFile: 0,
    });
  });

  it("refuses an image that is not in the database", () => {
    const f = file({ images: [...file().images, { imageID: 99, width: 640, height: 360, suggestions: [] }] });
    expect(planDetectorBoxes(f, IMAGES, []).problems).toContain("imageID 99 is not in the Image collection");
  });

  it("refuses a model-development image or one with no poolStatus", () => {
    const images = [...IMAGES, { imageID: 4, poolStatus: "model_dev", width: 640, height: 360, annotationList: [] }, { imageID: 5, width: 640, height: 360 }];
    const f = file({ images: [...file().images, { imageID: 4, width: 640, height: 360, suggestions: [] }, { imageID: 5, width: 640, height: 360, suggestions: [] }] });
    const { problems, updates, counts } = planDetectorBoxes(f, images, []);
    expect(problems.join(" | ")).toContain('imageID 4 has poolStatus "model_dev", not served or reserve');
    expect(problems.join(" | ")).toContain("imageID 5 has poolStatus null");
    expect(updates.map((u) => u.imageID)).not.toContain(4);
    expect(counts.imagesInFileByPoolStatus).toEqual({ served: 2, reserve: 1, model_dev: 1, none: 1 });
  });

  it("refuses an image whose width or height differs from the file", () => {
    const images = IMAGES.map((img) => (img.imageID === 2 ? { ...img, width: 1280 } : img.imageID === 3 ? { ...img, height: undefined } : img));
    const { problems } = planDetectorBoxes(file(), images, []);
    expect(problems).toContain("imageID 2 is 1280x360 in the database but 640x360 in the file");
    expect(problems).toContain("imageID 3 is 640xundefined in the database but 640x360 in the file");
  });

  it("refuses a run that leaves out a served or reserve image, with no way round it", () => {
    for (const left of [2, 3]) {
      const f = file({ images: file().images.filter((e) => e.imageID !== left) });
      const { problems, counts } = planDetectorBoxes(f, IMAGES, [], { skipAnswered: true });
      expect(problems.join(" ")).toContain(`1 served or reserve image(s) are not in the file (${left})`);
      expect(counts.poolImagesNotInFile).toBe(1);
    }
  });

  it("refuses an image a contributor has answered", () => {
    const { problems, updates } = planDetectorBoxes(file(), IMAGES, [3]);
    expect(problems).toEqual(["imageID 3 has contributor answers, which point at the suggestion ids this would replace"]);
    expect(updates.map((u) => u.imageID)).not.toContain(3);
  });

  it("with --skip-answered leaves an answered image alone and counts it", () => {
    const { problems, updates, counts } = planDetectorBoxes(file(), IMAGES, [3], { skipAnswered: true });
    expect(problems).toEqual([]);
    expect(updates.map((u) => u.imageID)).toEqual([1, 2]);
    expect(counts.imagesSkippedAnswered).toBe(1);
    expect(counts.imagesToWrite).toBe(2);
    expect(counts.suggestionsToWrite).toBe(2);
  });

  it("skips an image already at the file's detectorVersion, so a second run changes nothing", () => {
    const written = IMAGES.map((img) => ({ ...img, detectorVersion: "det-v1-rfdetr-medium", modelVersion: "v0-det-rfdetr-medium", step3AnnotationList: img.annotationList }));
    // Contributors may answer after the first run without making the second fail
    const { problems, updates, counts } = planDetectorBoxes(file(), written, [1, 2, 3]);
    expect(problems).toEqual([]);
    expect(updates).toEqual([]);
    expect(counts.imagesSkippedAlreadyWritten).toBe(3);
    expect(counts.imagesSkippedAnswered).toBe(0);
    expect(counts.currentModelVersions).toEqual({ "v0-det-rfdetr-medium": 3 });
  });

  it("refuses an image with step3AnnotationList but another or no detectorVersion", () => {
    const images = IMAGES.map((img) =>
      img.imageID === 1 ? { ...img, step3AnnotationList: [], detectorVersion: "det-v0-old" } : img.imageID === 2 ? { ...img, step3AnnotationList: [] } : img
    );
    const { problems } = planDetectorBoxes(file(), images, []);
    expect(problems).toContain('imageID 1 already has step3AnnotationList but detectorVersion "det-v0-old", so something else wrote it');
    expect(problems).toContain("imageID 2 already has step3AnnotationList but detectorVersion null, so something else wrote it");
  });

  it("treats an image with no modelVersion or annotationList as null", () => {
    const images = IMAGES.map((img) => (img.imageID === 2 ? { ...img, modelVersion: undefined, annotationList: undefined } : img));
    const { updates, counts } = planDetectorBoxes(file(), images, []);
    const two = updates.find((u) => u.imageID === 2);
    expect(two.fromVersion).toBeNull();
    expect(two.fromList).toBeNull();
    expect(counts.currentModelVersions.none).toBe(1);
  });

  it("names images by id and counts only, with no em dashes or semicolons", () => {
    const images = [...IMAGES.map((img) => ({ ...img, width: 1 })), { imageID: 7, poolStatus: "model_dev" }];
    const f = file({ images: [...file().images, { imageID: 7, width: 640, height: 360, suggestions: [] }] });
    const { problems } = planDetectorBoxes(f, images, []);
    expect(problems.length).toBeGreaterThan(0);
    for (const p of problems) {
      expect(p).toMatch(/imageID \d+/);
      expect(p).not.toMatch(/[—;]/);
    }
  });
});

describe("detectorBoxesOperation", () => {
  const now = new Date("2026-11-01T00:00:00Z");

  it("copies the old annotationList to step3AnnotationList and writes the boxes, versions and time", () => {
    const { updates } = planDetectorBoxes(file(), IMAGES, []);
    const op = detectorBoxesOperation(updates[0], file(), now);
    expect(op.updateOne.update).toEqual({
      $set: {
        step3AnnotationList: IMAGES[0].annotationList,
        annotationList: updates[0].annotationList,
        modelVersion: "v0-det-rfdetr-medium",
        detectorVersion: "det-v1-rfdetr-medium",
        segmenterVersion: "seg-v1-deeplabv3plus-r101",
        detectorBoxesWrittenAt: now,
      },
    });
  });

  it("matches the image only while it has the modelVersion and list length it was planned from and no step3AnnotationList", () => {
    const { updates } = planDetectorBoxes(file(), IMAGES, []);
    expect(detectorBoxesOperation(updates[0], file(), now).updateOne.filter).toEqual({
      imageID: 1,
      modelVersion: "v0-mapillary",
      annotationList: { $size: 2 },
      step3AnnotationList: { $exists: false },
    });
    expect(detectorBoxesOperation(updates[1], file(), now).updateOne.filter.annotationList).toEqual({ $size: 0 });
  });

  it("matches a missing annotationList and modelVersion as null, and keeps an empty list", () => {
    const images = IMAGES.map((img) => (img.imageID === 2 ? { ...img, modelVersion: undefined, annotationList: undefined } : img));
    const two = planDetectorBoxes(file(), images, []).updates.find((u) => u.imageID === 2);
    const op = detectorBoxesOperation(two, file(), now);
    expect(op.updateOne.filter).toEqual({ imageID: 2, modelVersion: null, annotationList: null, step3AnnotationList: { $exists: false } });
    expect(op.updateOne.update.$set.step3AnnotationList).toEqual([]);
  });
});

describe("tauReminder", () => {
  it("gives no reminder when tau is set for this detector", () => {
    expect(tauReminder({ _id: "tau", value: 0.5182, modelVersion: "det-v1-rfdetr-medium" }, file())).toEqual({
      value: 0.5182,
      modelVersion: "det-v1-rfdetr-medium",
      isDefault: false,
      message: null,
    });
  });

  it("reminds that set-tau.mjs is next when tau is the default or for another detector", () => {
    const missing = tauReminder(null, file());
    expect(missing).toMatchObject({ value: 0.5, isDefault: true, modelVersion: null });
    expect(missing.message).toContain("the default (nothing stored)");
    const other = tauReminder({ _id: "tau", value: 0.43, modelVersion: "det-v1-rfdetr-small" }, file());
    expect(other.message).toContain("for det-v1-rfdetr-small, not for det-v1-rfdetr-medium");
    for (const { message } of [missing, other]) {
      expect(message).toContain("scripts/set-tau.mjs --value 0.5 --model-version det-v1-rfdetr-medium");
      expect(message).not.toMatch(/[—;]/);
    }
  });
});

describe("runDetectorBoxes", () => {
  const now = new Date("2026-11-01T00:00:00Z");

  function setup(activeSessions, { matchedCount, modifiedCount, writtenBack = [] } = {}) {
    const data = file();
    const plan = { data, ...planDetectorBoxes(data, IMAGES, []) };
    const sessions = createMockCollection({ countDocuments: vi.fn().mockResolvedValue(activeSessions) });
    const images = createMockCollection({
      bulkWrite: vi.fn().mockResolvedValue({
        matchedCount: matchedCount ?? plan.updates.length,
        modifiedCount: modifiedCount ?? plan.updates.length,
      }),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(writtenBack) }),
    });
    const logs = createMockCollection();
    const db = createMockDb({ sessions, Image: images, telemetry_logs: logs });
    return { plan, db, sessions, images, logs, run: (options) => runDetectorBoxes(db, plan, { now, ...options }) };
  }

  it("counts the sessions whose status is active", async () => {
    const { sessions, run } = setup(0);
    await run({ apply: true });
    expect(sessions.countDocuments).toHaveBeenCalledWith({ status: "active" });
  });

  it("writes nothing with --apply while any session is active, giving only the count", async () => {
    const { images, logs, run } = setup(2);
    const result = await run({ apply: true });
    expect(result).toMatchObject({ activeSessions: 2, refused: true, written: false, modified: 0, logged: false });
    expect(result.message).toContain("2 active session(s)");
    expect(result.message).toContain("No image was changed.");
    expect(images.bulkWrite).not.toHaveBeenCalled();
    expect(logs.insertOne).not.toHaveBeenCalled();
  });

  it("writes nothing without --apply, with a warning when a session is active", async () => {
    for (const active of [0, 3]) {
      const { images, logs, run } = setup(active);
      const result = await run({ apply: false });
      expect(result).toMatchObject({ activeSessions: active, refused: false, written: false });
      expect(result.message === null).toBe(active === 0);
      if (active) expect(result.message).toMatch(/^Warning: 3 active session\(s\)\./);
      expect(images.bulkWrite).not.toHaveBeenCalled();
      expect(logs.insertOne).not.toHaveBeenCalled();
    }
  });

  it("writes every planned image in one bulkWrite and logs DETECTOR_BOXES_WRITTEN", async () => {
    const { plan, images, logs, run } = setup(0);
    const result = await run({ apply: true });
    expect(result).toMatchObject({ refused: false, written: true, modified: 3, unchanged: 0, suggestionsWritten: 3, logged: true, message: null });
    expect(images.bulkWrite).toHaveBeenCalledTimes(1);
    expect(images.bulkWrite).toHaveBeenCalledWith(plan.updates.map((u) => detectorBoxesOperation(u, plan.data, now)), { ordered: false });
    expect(images.find).not.toHaveBeenCalled();
    expect(logs.insertOne).toHaveBeenCalledWith({
      event: "DETECTOR_BOXES_WRITTEN",
      detectorVersion: "det-v1-rfdetr-medium",
      segmenterVersion: "seg-v1-deeplabv3plus-r101",
      modelVersion: "v0-det-rfdetr-medium",
      tau: 0.5,
      storageFloor: 0.1,
      boxesSha256: "abc123",
      imagesWritten: 3,
      suggestionsWritten: 3,
      imagesSkippedAlreadyWritten: 0,
      imagesSkippedAnswered: 0,
      timestamp: now,
    });
  });

  it("reports images that changed between the read and the write and counts only the suggestions written", async () => {
    // Image 1 (2 suggestions) changed in between: only 2 and 3 were written
    const { images, logs, run } = setup(0, { matchedCount: 2, modifiedCount: 2, writtenBack: [{ imageID: 2 }, { imageID: 3 }] });
    const result = await run({ apply: true });
    expect(result).toMatchObject({ modified: 2, unchanged: 1, suggestionsWritten: 1, logged: true });
    expect(images.find).toHaveBeenCalledWith({ imageID: { $in: [1, 2, 3] }, detectorBoxesWrittenAt: now }, { projection: { imageID: 1 } });
    expect(logs.insertOne.mock.calls[0][0]).toMatchObject({ imagesWritten: 2, suggestionsWritten: 1 });
  });

  it("logs nothing when every planned image changed in between", async () => {
    const { logs, run } = setup(0, { matchedCount: 0, modifiedCount: 0 });
    const result = await run({ apply: true });
    expect(result).toMatchObject({ written: true, modified: 0, unchanged: 3, logged: false });
    expect(logs.insertOne).not.toHaveBeenCalled();
  });

  it("writes and logs nothing on a second run, when every image is already written", async () => {
    const data = file();
    const written = IMAGES.map((img) => ({ ...img, detectorVersion: data.detectorVersion }));
    const plan = { data, ...planDetectorBoxes(data, written, []) };
    const images = createMockCollection();
    const logs = createMockCollection();
    const db = createMockDb({ sessions: createMockCollection(), Image: images, telemetry_logs: logs });
    const result = await runDetectorBoxes(db, plan, { apply: true, now });
    expect(result).toMatchObject({ written: true, modified: 0, logged: false });
    expect(images.bulkWrite).not.toHaveBeenCalled();
    expect(logs.insertOne).not.toHaveBeenCalled();
  });

  it("logs the skipped counts and a null hash when the file has none", async () => {
    const data = file({ boxesSha256: undefined });
    const plan = { data, ...planDetectorBoxes(data, IMAGES.map((img) => (img.imageID === 1 ? { ...img, detectorVersion: data.detectorVersion } : img)), [3], { skipAnswered: true }) };
    const images = createMockCollection({ bulkWrite: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }) });
    const logs = createMockCollection();
    const db = createMockDb({ sessions: createMockCollection(), Image: images, telemetry_logs: logs });
    await runDetectorBoxes(db, plan, { apply: true, now });
    expect(logs.insertOne.mock.calls[0][0]).toMatchObject({ boxesSha256: null, imagesWritten: 1, suggestionsWritten: 0, imagesSkippedAlreadyWritten: 1, imagesSkippedAnswered: 1 });
  });
});

describe("write-detector-boxes.mjs", () => {
  const source = readFileSync(new URL("../../../scripts/write-detector-boxes.mjs", import.meta.url), "utf-8");

  it("has exactly the options input, apply and skip-answered, so nothing overrides the session check", () => {
    const options = source.match(/options: \{([\s\S]*?)\n {2}\},/)[1];
    const names = [...options.matchAll(/^\s+"?([\w-]+)"?: \{ type/gm)].map((m) => m[1]);
    expect(names).toEqual(["input", "apply", "skip-answered"]);
    expect(source).toContain("{ apply: values.apply }");
    expect(source).toContain('skipAnswered: values["skip-answered"]');
  });

  it("writes only through runDetectorBoxes and prints at most 30 problems", () => {
    expect(source).toContain("runDetectorBoxes(db");
    expect(source).not.toContain("bulkWrite");
    expect(source).not.toContain("insertOne");
    expect(source).toContain("problems.slice(0, 30)");
  });

  it("reads and prints no usernames or emails", () => {
    const code = source.slice(source.indexOf("*/"));
    expect(code).not.toMatch(/username|email|userId|"users"/i);
  });

  it("explains the active session refusal at the top", () => {
    const header = source.slice(0, source.indexOf("*/"));
    expect(header).toContain("never writes while any session is active");
    expect(header).toContain("--apply");
    expect(header).toContain("--skip-answered");
  });
});
