/**
 * The checks, the plan and the write behind scripts/write-detector-boxes.mjs
 * (S1, 30 Oct 2026), which puts the frozen detector's boxes on every image a
 * contributor can be served, once, before the first contributor.
 *
 * Contributors must see the trained detector's boxes (chapter_4.tex lines
 * 178, 180 and 184, chapter_3.tex line 55). Until this runs, the served and
 * reserve images carry the Step 3 suggestions (ATLAS-3 labels and Mapillary
 * detections). Those stay on record in `step3AnnotationList`, the starting
 * point annotators were shown on reference images (docs/masterfile.md, Step
 * 8). update-predictions.mjs cannot do this: it only adds the classifier's
 * proposals to the suggestions an image already has and keeps their ids.
 *
 * The file the model-training repository writes (scripts/phase6_s1_file.py):
 *
 *   {
 *     "detectorVersion": "det-v1-rfdetr-medium",
 *     "segmenterVersion": "seg-v1-deeplabv3plus-r101",
 *     "modelVersion": "v0-det-rfdetr-medium",
 *     "tau": 0.5182,
 *     "storageFloor": 0.1,
 *     "boxesSha256": "...",
 *     "images": [
 *       {
 *         "imageID": 12, "imageName": "atlas3_makati_....jpg", "width": 640, "height": 360,
 *         "suggestions": [
 *           { "id": "det-0", "comment": "utility_post",
 *             "mark": { "x": 300.5, "y": 10, "width": 20, "height": 200, "type": "RECT" },
 *             "confidence": 0.91 }
 *         ]
 *       }
 *     ]
 *   }
 *
 * It holds every reference, deployment and reserve image and every box at
 * or above the storage floor (D8). `mark` is in pixels of the served display
 * copy. `modelVersion` starts with `v0-` because no classifier proposal
 * exists yet (§7ai), and the first classifier cycle replaces it.
 *
 * Nothing is written unless every check passes: every image in the file
 * exists, is served or reserve and has the file's size, every served and
 * reserve image is in the file, no contributor has answered it, and nothing
 * else has written `step3AnnotationList`. An image already at the file's
 * `detectorVersion` is skipped, so a second run changes nothing.
 *
 * `.mjs` with no `@/` imports, because the script imports it directly with
 * Node. Tests import it normally.
 */
import { MODEL_VERSION_PATTERN, ACTIVE_SESSION_STATUS, activeSessionCheck } from "./predictionUpdate.mjs";
import { TAXONOMY_18 } from "./imageImport.mjs";
import { tauSummary } from "./tauSetting.mjs";

/** Images a contributor can be served: reference and deployment ("served") and reserve */
export const DETECTOR_POOL_STATUSES = Object.freeze(["served", "reserve"]);

/** How far a box may reach past the image's edge, in pixels */
export const EDGE_TOLERANCE_PX = 0.5;

/** The `source` of a contributor's answer in `annotations` */
export const CONTRIBUTOR_SOURCE = "contributor";

export const DETECTOR_BOXES_EVENT = "DETECTOR_BOXES_WRITTEN";

/** Where the Step 3 suggestions are kept */
export const STEP3_FIELD = "step3AnnotationList";

/** What the script reads of each image */
export const IMAGE_PROJECTION = Object.freeze({
  imageID: 1,
  poolStatus: 1,
  width: 1,
  height: 1,
  modelVersion: 1,
  detectorVersion: 1,
  annotationList: 1,
  [STEP3_FIELD]: 1,
});

const isUnitNumber = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
const isPositive = (v) => isFiniteNumber(v) && v > 0;
const isNonEmptyString = (v) => typeof v === "string" && v.trim() !== "";

/** Problems with the file itself, as readable strings. Empty when it is valid. */
export function validateDetectorBoxesFile(data) {
  const problems = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["the file must hold one JSON object"];

  const { detectorVersion, segmenterVersion, modelVersion, tau, storageFloor, images } = data;
  if (!isNonEmptyString(detectorVersion)) problems.push("detectorVersion must be a non-empty string");
  if (!isNonEmptyString(segmenterVersion)) problems.push("segmenterVersion must be a non-empty string");
  if (typeof modelVersion !== "string" || !MODEL_VERSION_PATTERN.test(modelVersion) || !modelVersion.startsWith("v0-")) {
    problems.push(`modelVersion ${JSON.stringify(modelVersion)} must look like v0-<name>, for example v0-det-rfdetr-medium, since no classifier proposal exists yet`);
  }
  if (!isUnitNumber(tau)) problems.push("tau must be a number from 0 to 1");
  const floorOk = isUnitNumber(storageFloor);
  if (!floorOk) problems.push("storageFloor must be a number from 0 to 1");
  if (!Array.isArray(images) || images.length === 0) {
    problems.push("images must be a non-empty array");
    return problems;
  }

  const seen = new Set();
  images.forEach((entry, i) => {
    const tag = `images[${i}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`${tag} is not an object`);
      return;
    }
    const { imageID, width, height, suggestions } = entry;
    if (!Number.isSafeInteger(imageID)) {
      problems.push(`${tag}: imageID must be a whole number`);
    } else if (seen.has(imageID)) {
      problems.push(`${tag}: imageID ${imageID} appears twice`);
    } else {
      seen.add(imageID);
    }
    const itag = `${tag} (imageID ${imageID})`;
    const sizeOk = isPositive(width) && isPositive(height);
    if (!sizeOk) problems.push(`${itag}: width and height must be positive numbers`);
    if (!Array.isArray(suggestions)) {
      problems.push(`${itag}: suggestions must be an array`);
      return;
    }

    const ids = new Set();
    suggestions.forEach((s, j) => {
      const stag = `${itag} suggestions[${j}]`;
      if (!s || typeof s !== "object" || Array.isArray(s)) {
        problems.push(`${stag} is not an object`);
        return;
      }
      if (!isNonEmptyString(s.id)) problems.push(`${stag}: id must be a non-empty string`);
      else if (ids.has(s.id)) problems.push(`${stag}: id ${s.id} appears twice in this image`);
      else ids.add(s.id);
      if (!TAXONOMY_18.has(s.comment)) problems.push(`${stag}: comment ${JSON.stringify(s.comment)} is not one of the eighteen categories`);

      const m = s.mark;
      if (!m || typeof m !== "object") {
        problems.push(`${stag}: mark must be an object`);
      } else if (m.type !== "RECT" || !isFiniteNumber(m.x) || !isFiniteNumber(m.y) || !isPositive(m.width) || !isPositive(m.height)) {
        problems.push(`${stag}: mark must have finite x and y, positive width and height, and type RECT`);
      } else if (
        sizeOk &&
        (m.x < -EDGE_TOLERANCE_PX ||
          m.y < -EDGE_TOLERANCE_PX ||
          m.x + m.width > width + EDGE_TOLERANCE_PX ||
          m.y + m.height > height + EDGE_TOLERANCE_PX)
      ) {
        problems.push(`${stag}: mark lies outside the ${width}x${height} image`);
      }

      if (!isUnitNumber(s.confidence)) problems.push(`${stag}: confidence must be a number from 0 to 1`);
      else if (floorOk && s.confidence < storageFloor) problems.push(`${stag}: confidence ${s.confidence} is below the storage floor ${storageFloor}`);
    });
  });
  return problems;
}

/** One file suggestion as it is stored on the image record */
export function toStoredSuggestion(s) {
  const { x, y, width, height } = s.mark;
  return {
    id: s.id,
    comment: s.comment,
    mark: { x, y, width, height, type: "RECT" },
    confidence: s.confidence,
    selected: false,
    editable: false,
    isRejected: false,
  };
}

/**
 * What the plan needs from the database: every image in the file and every
 * served and reserve image (only the fields in IMAGE_PROJECTION), and the
 * ids of those images a contributor has answered. Reads nothing else, so no
 * username or answer leaves the database.
 */
export async function readDetectorBoxesState(db, data) {
  const fileIDs = data.images.map((e) => e.imageID);
  const images = await db
    .collection("Image")
    .find(
      { $or: [{ imageID: { $in: fileIDs } }, { poolStatus: { $in: [...DETECTOR_POOL_STATUSES] } }] },
      { projection: IMAGE_PROJECTION }
    )
    .toArray();
  const ids = [...new Set([...fileIDs, ...images.map((img) => img.imageID)])];
  const answeredImageIDs = await db.collection("annotations").distinct("imageID", { imageID: { $in: ids }, source: CONTRIBUTOR_SOURCE });
  return { images, answeredImageIDs };
}

/**
 * What a run would write, checked against the images as they are.
 *
 * `images` holds every image in the file and every served and reserve image
 * (IMAGE_PROJECTION). `answeredImageIDs` lists those a contributor has
 * answered. Returns `problems` (nothing may be written while there are any),
 * `updates` (one per image to write: its imageID, the modelVersion and the
 * annotationList it had, and its new annotationList) and `counts`.
 *
 * An image already at the file's detectorVersion is skipped. An answered
 * image is a problem, unless `skipAnswered` is set, when it is left as it is
 * and counted (staging after the pilot only).
 */
export function planDetectorBoxes(data, images, answeredImageIDs = [], { skipAnswered = false } = {}) {
  const problems = [];
  const byId = new Map((images || []).map((img) => [img.imageID, img]));
  const answered = new Set(answeredImageIDs || []);
  const inFile = new Set();
  const updates = [];
  const counts = {
    imagesInFile: data.images.length,
    imagesInFileByPoolStatus: {},
    currentModelVersions: {},
    imagesToWrite: 0,
    suggestionsToWrite: 0,
    suggestionsAtOrAboveTau: 0,
    imagesSkippedAlreadyWritten: 0,
    imagesSkippedAnswered: 0,
    poolImagesNotInFile: 0,
  };

  for (const entry of data.images) {
    inFile.add(entry.imageID);
    const img = byId.get(entry.imageID);
    if (!img) {
      problems.push(`imageID ${entry.imageID} is not in the Image collection`);
      continue;
    }
    const pool = img.poolStatus ?? "none";
    counts.imagesInFileByPoolStatus[pool] = (counts.imagesInFileByPoolStatus[pool] || 0) + 1;
    const version = img.modelVersion ?? "none";
    counts.currentModelVersions[version] = (counts.currentModelVersions[version] || 0) + 1;

    if (!DETECTOR_POOL_STATUSES.includes(img.poolStatus)) {
      problems.push(`imageID ${entry.imageID} has poolStatus ${JSON.stringify(img.poolStatus ?? null)}, not served or reserve (model-development images keep their Step 3 suggestions)`);
      continue;
    }
    if (img.width !== entry.width || img.height !== entry.height) {
      problems.push(`imageID ${entry.imageID} is ${img.width}x${img.height} in the database but ${entry.width}x${entry.height} in the file`);
      continue;
    }
    if (img.detectorVersion === data.detectorVersion) {
      counts.imagesSkippedAlreadyWritten += 1;
      continue;
    }
    if (img[STEP3_FIELD] !== undefined) {
      problems.push(`imageID ${entry.imageID} already has ${STEP3_FIELD} but detectorVersion ${JSON.stringify(img.detectorVersion ?? null)}, so something else wrote it`);
      continue;
    }
    if (answered.has(entry.imageID)) {
      if (skipAnswered) {
        counts.imagesSkippedAnswered += 1;
      } else {
        problems.push(`imageID ${entry.imageID} has contributor answers, which point at the suggestion ids this would replace`);
      }
      continue;
    }

    const annotationList = entry.suggestions.map(toStoredSuggestion);
    updates.push({
      imageID: img.imageID,
      fromVersion: img.modelVersion ?? null,
      fromList: Array.isArray(img.annotationList) ? img.annotationList : null,
      annotationList,
    });
    counts.imagesToWrite += 1;
    counts.suggestionsToWrite += annotationList.length;
    counts.suggestionsAtOrAboveTau += annotationList.filter((s) => s.confidence >= data.tau).length;
  }

  const notInFile = (images || [])
    .filter((img) => DETECTOR_POOL_STATUSES.includes(img.poolStatus) && !inFile.has(img.imageID))
    .map((img) => img.imageID)
    .sort((a, b) => a - b);
  counts.poolImagesNotInFile = notInFile.length;
  if (notInFile.length > 0) {
    const shown = notInFile.slice(0, 10).join(", ");
    problems.push(`${notInFile.length} served or reserve image(s) are not in the file (${shown}${notInFile.length > 10 ? ", ..." : ""}). Every image a contributor can be served must get the detector's boxes in one run`);
  }

  return { problems, updates, counts };
}

/**
 * The bulkWrite operation for one planned image. It keeps the current
 * annotationList in step3AnnotationList and writes the detector's boxes and
 * versions, and matches the image only while it still has the modelVersion
 * and the annotationList length it was planned from and no
 * step3AnnotationList, so nothing changed since it was read is overwritten.
 */
export function detectorBoxesOperation(update, data, now = new Date()) {
  const filter = {
    imageID: update.imageID,
    modelVersion: update.fromVersion,
    annotationList: update.fromList ? { $size: update.fromList.length } : null,
    [STEP3_FIELD]: { $exists: false },
  };
  return {
    updateOne: {
      filter,
      update: {
        $set: {
          [STEP3_FIELD]: update.fromList ?? [],
          annotationList: update.annotationList,
          modelVersion: data.modelVersion,
          detectorVersion: data.detectorVersion,
          segmenterVersion: data.segmenterVersion,
          detectorBoxesWrittenAt: now,
        },
      },
    },
  };
}

/**
 * The stored τ and a reminder when it is not for this detector (S2). The
 * order is S1, then τ, so a stale τ is not a problem.
 */
export function tauReminder(tauDoc, data) {
  const summary = tauSummary(tauDoc);
  const current = summary.isDefault ? "the default (nothing stored)" : `for ${summary.modelVersion ?? "no model version"}`;
  const message =
    summary.modelVersion === data.detectorVersion
      ? null
      : `The tau setting is ${current}, not for ${data.detectorVersion}. Next step: node --env-file=.env scripts/set-tau.mjs --value ${data.tau} --model-version ${data.detectorVersion} --precision <p> --recall <r> --by <name>`;
  return { value: summary.value, modelVersion: summary.modelVersion, isDefault: summary.isDefault, message };
}

/**
 * The write step of write-detector-boxes.mjs, for a plan with no problems.
 * Counts active sessions first (S5): an open session holds the old
 * suggestion ids. Without `apply`, or with any active session, nothing is
 * written. Otherwise writes every planned image in one bulkWrite and, when
 * any image changed, logs DETECTOR_BOXES_WRITTEN.
 *
 * Returns { activeSessions, message, refused, written, modified, unchanged,
 * suggestionsWritten, logged }, where unchanged is the number of planned
 * images that changed between the read and the write and were left alone.
 */
export async function runDetectorBoxes(db, { data, updates, counts }, { apply = false, now = new Date() } = {}) {
  const activeSessions = await db.collection("sessions").countDocuments({ status: ACTIVE_SESSION_STATUS });
  const { refuse, message } = activeSessionCheck(activeSessions, { apply });
  const result = { activeSessions, message, refused: refuse, written: false, modified: 0, unchanged: 0, suggestionsWritten: 0, logged: false };
  if (!apply || refuse) return result;

  result.written = true;
  if (updates.length > 0) {
    const write = await db.collection("Image").bulkWrite(updates.map((u) => detectorBoxesOperation(u, data, now)), { ordered: false });
    result.modified = write.modifiedCount ?? 0;
    result.unchanged = Math.max(0, updates.length - (write.matchedCount ?? 0));
    if (result.unchanged === 0) {
      result.suggestionsWritten = counts.suggestionsToWrite;
    } else {
      // Some were left alone: count the suggestions of the images this run wrote
      const written = await db
        .collection("Image")
        .find({ imageID: { $in: updates.map((u) => u.imageID) }, detectorBoxesWrittenAt: now }, { projection: { imageID: 1 } })
        .toArray();
      const ids = new Set(written.map((img) => img.imageID));
      result.suggestionsWritten = updates.filter((u) => ids.has(u.imageID)).reduce((n, u) => n + u.annotationList.length, 0);
    }
  }

  // A run that wrote nothing (every image already written) is not logged
  if (result.modified > 0) {
    await db.collection("telemetry_logs").insertOne({
      event: DETECTOR_BOXES_EVENT,
      detectorVersion: data.detectorVersion,
      segmenterVersion: data.segmenterVersion,
      modelVersion: data.modelVersion,
      tau: data.tau,
      storageFloor: data.storageFloor,
      boxesSha256: data.boxesSha256 ?? null,
      imagesWritten: result.modified,
      suggestionsWritten: result.suggestionsWritten,
      imagesSkippedAlreadyWritten: counts.imagesSkippedAlreadyWritten,
      imagesSkippedAnswered: counts.imagesSkippedAnswered,
      timestamp: now,
    });
    result.logged = true;
  }
  return result;
}
