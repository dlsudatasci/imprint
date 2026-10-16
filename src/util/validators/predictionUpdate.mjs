/**
 * The checks and the plan behind scripts/update-predictions.mjs, which writes
 * the obstruction classifier's proposed judgments after each retraining cycle
 * (16 Oct 2026).
 *
 * The manuscript keeps the detector's output fixed for the whole study and
 * refreshes only the classifier's: "The object detection and sidewalk
 * segmentation models are trained once and remain fixed for the entire study,
 * so the candidate boxes and masks a contributor sees never change" and "the
 * underlying candidate boxes and masks remain unchanged throughout, so the
 * proposed obstruction judgment is the only part of a suggestion that differs
 * from one cycle to the next" (chapter_4.tex, Human-in-the-Loop Workflow). After
 * each cycle "the same batch process reruns only the obstruction classifier
 * over every image in the deployment pool, updating their stored obstruction
 * judgments to the current model version and recording that version alongside
 * each judgment" (chapter_5.tex). The script used to replace every image's
 * suggestions with new boxes and new ids instead.
 *
 * So an update only adds, to suggestions the image already has, the
 * classifier's proposal for each: `proposedObstructs` (true or false) and
 * `obstructionProbability` (0 to 1), and sets the image's `modelVersion`, the
 * served model version that every annotation records. A box's id, category,
 * position, confidence and every other field stay as they are. Nothing is
 * written unless every check passes: every image in the file exists, every
 * suggestion of each image gets exactly one proposal, and, unless partial
 * runs are allowed, every image served to contributors is in the file (the
 * whole pool is recomputed, chapter_4.tex).
 *
 * `.mjs` with no `@/` imports, because the script imports it directly with
 * Node. Tests import it normally.
 *
 * The file the retraining pipeline writes:
 *
 *   {
 *     "modelVersion": "v1-xgboost",
 *     "decisionThreshold": 0.42,
 *     "predictions": [
 *       {
 *         "imageID": 1459,
 *         "proposals": [
 *           { "boxId": "mly-0", "obstructs": false, "probability": 0.12 },
 *           { "boxId": "mly-3", "obstructs": true, "probability": 0.81 }
 *         ]
 *       }
 *     ]
 *   }
 *
 * `decisionThreshold` is the cut-off chosen on the validation split
 * (chapter_4.tex, Obstruction Classifier). Each proposal's `obstructs` must be
 * its probability at or above it, so a file whose two disagree is refused.
 */

export const MODEL_VERSION_PATTERN = /^v\d+-\w[\w-]*$/;

/** Where the proposal goes on each suggestion */
export const PROPOSAL_FIELDS = Object.freeze({ obstructs: "proposedObstructs", probability: "obstructionProbability" });

/** Images served to contributors (Step 5): deployment and reference images alike */
export const SERVED_POOL_STATUS = "served";

const isProbability = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/** Problems with the file itself, as readable strings. Empty when it is valid. */
export function validatePredictionFile(data) {
  const problems = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["the file must hold one JSON object"];

  const { modelVersion, decisionThreshold, predictions } = data;
  if (typeof modelVersion !== "string" || !MODEL_VERSION_PATTERN.test(modelVersion)) {
    problems.push(`modelVersion ${JSON.stringify(modelVersion)} must look like v<number>-<name>, for example v1-xgboost`);
  }
  const thresholdOk = isProbability(decisionThreshold);
  if (!thresholdOk) problems.push("decisionThreshold must be a number from 0 to 1");
  if ("boxes" in data || (Array.isArray(predictions) && predictions.some((e) => e && typeof e === "object" && "boxes" in e))) {
    problems.push("boxes are not accepted: the detector's boxes never change, only the proposals do (use proposals)");
  }
  if (!Array.isArray(predictions) || predictions.length === 0) {
    problems.push("predictions must be a non-empty array");
    return problems;
  }

  const seen = new Set();
  predictions.forEach((entry, i) => {
    const tag = `predictions[${i}]`;
    if (!entry || typeof entry !== "object") {
      problems.push(`${tag} is not an object`);
      return;
    }
    const { imageID, proposals } = entry;
    if (!Number.isSafeInteger(imageID) || imageID < 1) {
      problems.push(`${tag}: imageID must be a positive whole number`);
    } else if (seen.has(imageID)) {
      problems.push(`${tag}: imageID ${imageID} appears twice`);
    } else {
      seen.add(imageID);
    }
    if (!Array.isArray(proposals)) {
      problems.push(`${tag} (imageID ${imageID}): proposals must be an array`);
      return;
    }
    const boxIds = new Set();
    proposals.forEach((p, j) => {
      const ptag = `${tag} (imageID ${imageID}) proposals[${j}]`;
      if (!p || typeof p !== "object") {
        problems.push(`${ptag} is not an object`);
        return;
      }
      if (typeof p.boxId !== "string" || !p.boxId) problems.push(`${ptag}: boxId must be a non-empty string`);
      else if (boxIds.has(p.boxId)) problems.push(`${ptag}: box ${p.boxId} has two proposals`);
      else boxIds.add(p.boxId);
      if (typeof p.obstructs !== "boolean") problems.push(`${ptag}: obstructs must be true or false`);
      if (!isProbability(p.probability)) problems.push(`${ptag}: probability must be a number from 0 to 1`);
      else if (thresholdOk && typeof p.obstructs === "boolean" && p.obstructs !== p.probability >= decisionThreshold) {
        problems.push(`${ptag}: obstructs is ${p.obstructs} but probability ${p.probability} is ${p.probability >= decisionThreshold ? "at or above" : "below"} the threshold ${decisionThreshold}`);
      }
    });
  });
  return problems;
}

/**
 * What an update would write, checked against the images as they are.
 *
 * `images` holds every image named in the file and every served image, each
 * with imageID, modelVersion, poolStatus and annotationList. Returns
 * `problems` (nothing may be written while there are any), `updates` (one per
 * image to change: its imageID, the modelVersion it had, the ids of its
 * suggestions, and its new annotationList) and `counts`.
 *
 * An image already at this modelVersion is skipped unless `force` is set, so a
 * run that stopped part way can be run again. Served images missing from the
 * file are a problem unless `allowPartial` is set.
 */
export function planPredictionUpdate(data, images, { force = false, allowPartial = false } = {}) {
  const problems = [];
  const byId = new Map((images || []).map((img) => [img.imageID, img]));
  const inFile = new Set();
  const updates = [];
  const counts = {
    imagesInFile: data.predictions.length,
    imagesUpdated: 0,
    imagesSkippedSameVersion: 0,
    proposalsWritten: 0,
    imagesNotServed: 0,
    servedImagesNotInFile: 0,
  };

  for (const entry of data.predictions) {
    inFile.add(entry.imageID);
    const img = byId.get(entry.imageID);
    if (!img) {
      problems.push(`imageID ${entry.imageID} is not in the Image collection`);
      continue;
    }
    if (img.poolStatus !== SERVED_POOL_STATUS) counts.imagesNotServed += 1;

    const list = Array.isArray(img.annotationList) ? img.annotationList : [];
    // Every box on an image record is a suggestion: drawn boxes live in the annotations
    const suggestionIds = list.filter((box) => box && box.editable !== true).map((box) => String(box.id));
    const proposals = new Map(entry.proposals.map((p) => [p.boxId, p]));
    for (const boxId of proposals.keys()) {
      if (!suggestionIds.includes(boxId)) problems.push(`imageID ${entry.imageID}: box ${boxId} is not one of its suggestions`);
    }
    for (const id of suggestionIds) {
      if (!proposals.has(id)) problems.push(`imageID ${entry.imageID}: suggestion ${id} has no proposal`);
    }

    if (!force && img.modelVersion === data.modelVersion) {
      counts.imagesSkippedSameVersion += 1;
      continue;
    }

    const annotationList = list.map((box) => {
      const p = box && box.editable !== true ? proposals.get(String(box.id)) : undefined;
      if (!p) return box;
      return { ...box, [PROPOSAL_FIELDS.obstructs]: p.obstructs, [PROPOSAL_FIELDS.probability]: p.probability };
    });
    updates.push({ imageID: img.imageID, fromVersion: img.modelVersion ?? null, suggestionIds, annotationList });
    counts.imagesUpdated += 1;
    counts.proposalsWritten += proposals.size;
  }

  const notInFile = (images || [])
    .filter((img) => img.poolStatus === SERVED_POOL_STATUS && !inFile.has(img.imageID))
    .map((img) => img.imageID)
    .sort((a, b) => a - b);
  counts.servedImagesNotInFile = notInFile.length;
  if (notInFile.length > 0 && !allowPartial) {
    const shown = notInFile.slice(0, 10).join(", ");
    problems.push(`${notInFile.length} image(s) served to contributors are not in the file (${shown}${notInFile.length > 10 ? ", ..." : ""}). Every served image is recomputed each cycle. Use --allow-partial only to finish a run that was split on purpose`);
  }

  return { problems, updates, counts };
}

/**
 * The bulkWrite operation for one planned update. It matches the image only
 * while it still has the modelVersion and the suggestions it was planned
 * from, so nothing changed since it was read is overwritten.
 */
export function updateOperation(update, modelVersion, now = new Date()) {
  const filter = {
    imageID: update.imageID,
    modelVersion: update.fromVersion,
    annotationList: { $size: update.annotationList.length },
  };
  if (update.suggestionIds.length > 0) filter["annotationList.id"] = { $all: update.suggestionIds };
  return {
    updateOne: {
      filter,
      update: { $set: { annotationList: update.annotationList, modelVersion, predictionUpdatedAt: now } },
    },
  };
}
