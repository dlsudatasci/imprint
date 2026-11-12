/**
 * How far the contributors are toward the next retraining cycle, shared by the
 * admin Retraining tab (`/api/admin/retraining`, S24) and the email sent when a
 * cycle is ready (`retrainingNotice.js`, S26, 12 Nov 2026), so the two never
 * disagree.
 *
 * The count is in contributor judgments, the rows the retraining export
 * (`export-data.mjs --retraining`) would write for completed annotations whose
 * source is not "annotator". It calls the export's own buildRetrainingRows:
 * reference images, Not an object, free-text categories, boxes under the
 * minimum size and boxes without a Yes or No are left out. Contributors flagged
 * by quality control are not removed here, which is done on the training VM at
 * each cycle. Only counts are returned, never usernames, ids or rows.
 */
import { buildRetrainingRows } from "@/util/validators/retrainingExport.mjs";

/**
 * A retraining cycle runs every 2,000 verified object judgments
 * (chapter_4.tex, Model Retraining). The midpoint rule there (line 426) may
 * change this once during the study.
 */
export const RETRAINING_INCREMENT = 2000;

/**
 * The starting model, trained on the annotators' data and loaded at launch.
 * Its MODEL_PREDICTIONS_UPDATED events are not a retraining cycle.
 */
export const INITIAL_MODEL_VERSION = "v1-xgboost";

/** What buildRetrainingRows reads from an annotation, and nothing else. */
const ANNOTATION_PROJECTION = {
  _id: 0, imageID: 1, userId: 1, source: 1, selectedObjectsID: 1,
  newObjects: 1, hasSidewalk: 1, servedModelVersion: 1,
};
const IMAGE_PROJECTION = { _id: 0, imageID: 1, isReference: 1, width: 1, height: 1 };

/**
 * Cycles run: the distinct model versions written by update-predictions.mjs,
 * leaving out the starting model. A version written in several partial runs
 * counts once. The next cycle is at (cycles run + 1) increments.
 */
export function retrainingProgress(judgments, cycleVersions) {
  const versions = new Set(cycleVersions.filter((v) => v && v !== INITIAL_MODEL_VERSION));
  const retrainingCyclesRun = versions.size;
  const nextRetrainingAt = (retrainingCyclesRun + 1) * RETRAINING_INCREMENT;
  return {
    retrainingCyclesRun,
    retrainingIncrement: RETRAINING_INCREMENT,
    nextRetrainingAt,
    judgmentsUntilNext: Math.max(0, nextRetrainingAt - judgments),
  };
}

/** The contributor judgments the retraining export would use, as counts only. */
export async function countContributorJudgments(db) {
  const annotations = await db.collection("annotations")
    .find({ status: "completed", source: { $ne: "annotator" } }, { projection: ANNOTATION_PROJECTION })
    .toArray();
  const imageIDs = [...new Set(annotations.map((a) => a.imageID))];
  const images = imageIDs.length === 0 ? [] : await db.collection("Image")
    .find({ imageID: { $in: imageIDs } }, { projection: IMAGE_PROJECTION })
    .toArray();
  const imageMap = new Map(images.map((img) => [img.imageID, img]));

  // The demographic columns do not decide which rows are kept
  const { rows, summary } = buildRetrainingRows({ annotations, userMap: new Map(), imageMap });
  return {
    contributorJudgments: rows.length,
    contributorAnnotations: annotations.length,
    contributorAnnotationsOnReference: summary.excludedReferenceAnnotations,
  };
}

/**
 * The counts and the progress together, as the Retraining tab shows them. It
 * reads the model versions from the MODEL_PREDICTIONS_UPDATED events itself.
 */
export async function readRetrainingProgress(db) {
  const [judgments, cycles] = await Promise.all([
    countContributorJudgments(db),
    db.collection("telemetry_logs")
      .find({ event: "MODEL_PREDICTIONS_UPDATED" }, { projection: { _id: 0, modelVersion: 1 } })
      .toArray(),
  ]);
  return {
    ...judgments,
    ...retrainingProgress(judgments.contributorJudgments, cycles.map((c) => c.modelVersion)),
  };
}
