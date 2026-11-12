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
 * are returned, never usernames, ids or rows. The counting is in
 * src/util/retrainingProgress.js (S26).
 */
import { requireAdmin } from "@/util/adminAuth";
import { readTauSetting, tauSummary } from "@/util/validators/tauSetting.mjs";
import { countContributorJudgments, retrainingProgress } from "@/util/retrainingProgress";

// The counting moved to src/util/retrainingProgress.js (S26, 12 Nov 2026), so
// the email sent when a cycle is ready uses the same numbers as this tab
export { RETRAINING_INCREMENT, INITIAL_MODEL_VERSION, retrainingProgress } from "@/util/retrainingProgress";

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
