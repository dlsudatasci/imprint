/**
 * GET /api/admin/retraining — retraining cycle history and readiness.
 *
 * Returns past retraining cycles (from MODEL_PREDICTIONS_UPDATED telemetry),
 * model version distribution across Image documents, the suggestion threshold
 * τ in use with the detector it was chosen for (S2), and how far the
 * contributors are toward the next retraining cycle (S24, 12 Nov 2026).
 *
 * The count toward the next cycle is in contributor judgments, the rows the
 * retraining export (`export-data.mjs --retraining`) would write for completed
 * annotations whose source is not "annotator". It calls the export's own
 * buildRetrainingRows, so the two never disagree: reference images, Not an
 * object, free-text categories, boxes under the minimum size and boxes without
 * a Yes or No are left out. Contributors flagged by quality control are not
 * removed here, which is done on the training VM at each cycle. Only counts
 * are returned, never usernames, ids or rows.
 */
import { requireAdmin } from "@/util/adminAuth";
import { readTauSetting, tauSummary } from "@/util/validators/tauSetting.mjs";
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
async function countContributorJudgments(db) {
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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const { db } = auth;

  const [cycles, versionDist, totalImages, judgments, tauSetting] = await Promise.all([
    db.collection("telemetry_logs")
      .find({ event: "MODEL_PREDICTIONS_UPDATED" })
      .sort({ timestamp: -1 })
      .toArray(),

    db.collection("Image").aggregate([
      {
        $group: {
          _id: { $ifNull: ["$modelVersion", "v0-mapillary"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]).toArray(),

    db.collection("Image").countDocuments(),

    countContributorJudgments(db),

    readTauSetting(db),
  ]);

  // From 16 Oct 2026 update-predictions.mjs writes only the classifier's
  // proposals and never clears or replaces an image's suggestions, so a cycle
  // reports the proposals written, the images skipped as already current, and
  // served images left out of a partial run, in place of images cleared and
  // missing
  const retrainingCycles = cycles.map((c) => ({
    modelVersion: c.modelVersion,
    timestamp: c.timestamp,
    decisionThreshold: c.decisionThreshold ?? null,
    predictionsInFile: c.predictionsInFile ?? null,
    imagesUpdated: c.imagesUpdated ?? null,
    proposalsWritten: c.proposalsWritten ?? null,
    imagesSkippedSameVersion: c.imagesSkippedSameVersion ?? null,
    servedImagesNotInFile: c.servedImagesNotInFile ?? null,
  }));

  const versionDistribution = versionDist.map((v) => ({
    version: v._id,
    count: v.count,
  }));

  return res.status(200).json({
    retrainingCycles,
    cycleCount: retrainingCycles.length,
    versionDistribution,
    totalImages,
    ...judgments,
    ...retrainingProgress(judgments.contributorJudgments, cycles.map((c) => c.modelVersion)),
    tau: tauSummary(tauSetting),
  });
}
