/**
 * GET /api/admin/stats — overview statistics for the admin dashboard.
 *
 * Returns contributor counts, annotation totals, session health (completion
 * and abandonment rates, the average duration of contributors' completed
 * sessions), and model version distribution.
 */
import { requireAdmin } from "@/util/adminAuth";
import { annotatorIdForms, completedSessionQuery, averageSessionDurationMs } from "@/util/validators/sessionDuration";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const { db } = auth;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalAnnotations,
    contributorStats,
    todayStats,
    sessionHealth,
    modelStats,
  ] = await Promise.all([
    db.collection("annotations").countDocuments(),

    db.collection("annotations").aggregate([
      { $group: { _id: null, users: { $addToSet: "$userId" } } },
    ]).toArray(),

    db.collection("telemetry_logs").aggregate([
      {
        $match: {
          event: "IMAGE_SUBMITTED",
          timestamp: { $gte: todayStart },
        },
      },
      {
        $group: {
          _id: null,
          annotationsToday: { $sum: 1 },
          activeUsers: { $addToSet: "$userId" },
        },
      },
    ]).toArray(),

    db.collection("sessions").aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]).toArray(),

    db.collection("telemetry_logs").aggregate([
      { $match: { event: "SESSION_START" } },
      {
        $group: {
          _id: { $ifNull: ["$modelVersion", "unknown"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]).toArray(),
  ]);

  const totalContributors = contributorStats[0]?.users?.length ?? 0;
  const annotationsToday = todayStats[0]?.annotationsToday ?? 0;
  const activeContributorsToday = todayStats[0]?.activeUsers?.length ?? 0;

  const sessionCounts = {};
  for (const row of sessionHealth) {
    sessionCounts[row._id] = row.count;
  }
  const completed = sessionCounts.completed || 0;
  const abandoned = sessionCounts.abandoned || 0;
  const totalSessions = completed + abandoned + (sessionCounts.active || 0);

  // Contributors' completed sessions, from start to completion (S22). Read
  // from the sessions collection: the SESSION_COMPLETE event it averaged
  // before is never written.
  const annotators = await db
    .collection("users")
    .find({ role: "annotator" }, { projection: { _id: 1 } })
    .toArray();
  const annotatorIds = annotatorIdForms(annotators);
  const completedSessions = await db
    .collection("sessions")
    .find(completedSessionQuery(annotatorIds), { projection: { userId: 1, status: 1, createdAt: 1, completedAt: 1 } })
    .toArray();

  return res.status(200).json({
    totalContributors,
    totalAnnotations,
    annotationsToday,
    activeContributorsToday,
    completionRate: totalSessions > 0 ? +(completed / totalSessions * 100).toFixed(1) : 0,
    abandonmentRate: totalSessions > 0 ? +(abandoned / totalSessions * 100).toFixed(1) : 0,
    avgSessionDurationMs: averageSessionDurationMs(completedSessions, annotatorIds),
    totalSessions,
    modelVersions: modelStats.map((m) => ({ version: m._id, count: m.count })),
  });
}
