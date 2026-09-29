/**
 * GET /api/admin/quality/degenerate — flag contributors with suspicious
 * annotation patterns.
 *
 * Scans contributors with 10+ completed annotations for: all-yes/all-no
 * obstruction judgments, constant severity, identical scene ratings across
 * images, and impossibly fast submissions (< 5s mean).
 */
import { requireAdmin } from "@/util/adminAuth";
import { detectDegenerateFlags } from "@/util/validators/qualityMetrics";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const { db } = auth;

  const contributors = await db
    .collection("annotations")
    .aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
      { $match: { count: { $gte: 10 } } },
    ])
    .toArray();

  const userIds = contributors.map((c) => c._id);
  if (userIds.length === 0) {
    return res.status(200).json({ flaggedContributors: [], scannedCount: 0 });
  }

  const allAnnotations = await db
    .collection("annotations")
    .find({ userId: { $in: userIds }, status: "completed" })
    .toArray();

  const allTelemetry = await db
    .collection("telemetry_logs")
    .find({ userId: { $in: userIds }, event: "IMAGE_SUBMITTED" })
    .toArray();

  const annotationsByUser = new Map();
  for (const ann of allAnnotations) {
    if (!annotationsByUser.has(ann.userId)) annotationsByUser.set(ann.userId, []);
    annotationsByUser.get(ann.userId).push(ann);
  }

  const telemetryByUser = new Map();
  for (const ev of allTelemetry) {
    if (!telemetryByUser.has(ev.userId)) telemetryByUser.set(ev.userId, []);
    telemetryByUser.get(ev.userId).push(ev);
  }

  const userDocs = await db
    .collection("users")
    .find({}, { projection: { _id: 1, username: 1 } })
    .toArray();
  const usernameMap = new Map();
  for (const u of userDocs) usernameMap.set(String(u._id), u.username);

  const flaggedContributors = [];

  for (const userId of userIds) {
    const annotations = annotationsByUser.get(userId) || [];
    const telemetry = telemetryByUser.get(userId) || [];

    const flags = detectDegenerateFlags(annotations, telemetry);
    if (flags.length > 0) {
      flaggedContributors.push({
        userId,
        username: usernameMap.get(userId) || userId,
        annotationCount: annotations.length,
        flags,
      });
    }
  }

  flaggedContributors.sort((a, b) => b.flags.length - a.flags.length);

  return res.status(200).json({
    flaggedContributors,
    scannedCount: userIds.length,
  });
}
