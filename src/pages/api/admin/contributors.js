/**
 * GET /api/admin/contributors — per-contributor annotation table.
 *
 * Returns username, total annotations, session count, average time per image,
 * and last active date for each contributor, sorted by annotations descending.
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

  const contributors = await db.collection("annotations").aggregate([
    {
      $group: {
        _id: "$userId",
        totalAnnotations: { $sum: 1 },
        lastActive: { $max: "$createdAt" },
      },
    },
    {
      $lookup: {
        from: "users",
        let: { uid: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: [{ $toString: "$_id" }, "$$uid"] } } },
          { $project: { username: 1, role: 1 } },
        ],
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "sessions",
        let: { uid: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$userId", "$$uid"] } } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ],
        as: "sessionData",
      },
    },
    { $unwind: { path: "$sessionData", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "telemetry_logs",
        let: { uid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$userId", "$$uid"] },
              event: "IMAGE_SUBMITTED",
            },
          },
          {
            $group: {
              _id: null,
              avgTime: { $avg: "$imageDurationMs" },
            },
          },
        ],
        as: "timeData",
      },
    },
    { $unwind: { path: "$timeData", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        username: { $ifNull: ["$user.username", "unknown"] },
        role: { $ifNull: ["$user.role", "contributor"] },
        totalAnnotations: 1,
        sessionCount: { $ifNull: ["$sessionData.count", 0] },
        lastActive: 1,
        avgTimePerImageMs: { $ifNull: ["$timeData.avgTime", null] },
      },
    },
    { $sort: { totalAnnotations: -1 } },
  ]).toArray();

  return res.status(200).json({ contributors });
}
