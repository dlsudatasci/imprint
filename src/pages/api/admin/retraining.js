/**
 * GET /api/admin/retraining — retraining cycle history and readiness.
 *
 * Returns past retraining cycles (from MODEL_PREDICTIONS_UPDATED telemetry),
 * model version distribution across Image documents, and annotation milestone
 * tracking (next cycle triggers at ~2000-judgment increments).
 */
import { requireAdmin } from "@/util/adminAuth";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const { db } = auth;

  const [cycles, versionDist, totalImages, annotationMilestone] = await Promise.all([
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

    db.collection("annotations").countDocuments({ status: "completed" }),
  ]);

  const retrainingCycles = cycles.map((c) => ({
    modelVersion: c.modelVersion,
    timestamp: c.timestamp,
    predictionsInFile: c.predictionsInFile ?? null,
    imagesUpdated: c.imagesUpdated ?? null,
    imagesCleared: c.imagesCleared ?? null,
    imagesMissing: c.imagesMissing ?? null,
  }));

  const versionDistribution = versionDist.map((v) => ({
    version: v._id,
    count: v.count,
  }));

  const nextCycleAt = annotationMilestone === 0
    ? 2000
    : Math.ceil(annotationMilestone / 2000) * 2000;

  return res.status(200).json({
    retrainingCycles,
    cycleCount: retrainingCycles.length,
    versionDistribution,
    totalImages,
    totalCompletedAnnotations: annotationMilestone,
    nextRetrainingAt: nextCycleAt,
    annotationsUntilNext: Math.max(0, nextCycleAt - annotationMilestone),
  });
}
