/**
 * GET /api/admin/annotator-reference-progress — each annotator's progress
 * through the reference image set.
 *
 * Returns the total reference image count and per-annotator completion
 * counts, sorted by percentage descending.
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

  const referenceImageCount = await db
    .collection("Image")
    .countDocuments({ isReference: true, poolStatus: "served" });

  const refImageIDs = await db
    .collection("Image")
    .find({ isReference: true, poolStatus: "served" }, { projection: { imageID: 1 } })
    .toArray()
    .then((docs) => docs.map((d) => d.imageID));

  const annotators = await db
    .collection("users")
    .find({ role: "annotator" }, { projection: { username: 1 } })
    .toArray();

  const completionCounts = await db
    .collection("annotations")
    .aggregate([
      { $match: { imageID: { $in: refImageIDs }, status: "completed" } },
      { $group: { _id: "$userId", completed: { $sum: 1 } } },
    ])
    .toArray();

  const completionMap = new Map(completionCounts.map((c) => [c._id, c.completed]));

  const result = annotators.map((a) => {
    const completed = completionMap.get(a._id.toString()) || 0;
    return {
      userId: a._id.toString(),
      username: a.username,
      completed,
      total: referenceImageCount,
      percentage: referenceImageCount > 0
        ? +((completed / referenceImageCount) * 100).toFixed(1)
        : 0,
    };
  });

  result.sort((a, b) => b.percentage - a.percentage);

  return res.status(200).json({
    referenceImageCount,
    annotators: result,
  });
}
