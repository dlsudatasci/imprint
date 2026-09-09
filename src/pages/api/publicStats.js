import { connectToDatabase } from "@/util/mongodb";
import { normalizeCityName } from "@/util/cities";

/**
 * GET /api/publicStats             → totals across every city
 * GET /api/publicStats?city=Makati → the same figures for one city
 *
 * Supplies the contribution figures under the map on the landing page.
 *
 * Open to everyone without signing in, which is the point — showing progress to
 * people who haven't joined yet is what the landing page is for. Everything
 * returned is therefore an aggregate: no usernames, no individual records,
 * nothing identifying who contributed what.
 *
 * Runs four separate database aggregations rather than one. They group at
 * different levels — whole images, then individual boxes — and combining them
 * would be harder to follow than four straightforward passes.
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  // Repeating the param (?city=a&city=b) makes req.query.city an array, so let
  // normalizeCityName reject it rather than blowing up on .toLowerCase()
  const citySlug = normalizeCityName(req.query.city);
  const imageFilter = citySlug ? { city: citySlug } : {};
  const filter = { ...imageFilter, source: { $ne: "annotator" } };

  try {
    const { db } = await connectToDatabase();

    const totalImages = await db.collection("Image").countDocuments(imageFilter);

    const [annStats] = await db.collection("annotations").aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          avgRating: { $avg: "$sceneLevel.overallAccessibility" },
          users: { $addToSet: "$userId" },
        },
      },
    ]).toArray();

    // Leaderboard of what actually blocks sidewalks. Confirmed model
    // suggestions and user-drawn boxes are concatenated because both are real
    // obstructions — only the provenance differs — then unwound so each box
    // becomes its own row to group by label.
    const obstructions = await db.collection("annotations").aggregate([
      { $match: filter },
      { $project: { boxes: { $concatArrays: [{ $ifNull: ["$selectedObjectsID", []] }, { $ifNull: ["$newObjects", []] }] } } },
      { $unwind: "$boxes" },
      { $match: { $or: [{ "boxes.comment": { $exists: true, $ne: "" } }, { "boxes.isObstruction": true }] } },
      { $group: { _id: { $ifNull: ["$boxes.comment", "Unknown"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]).toArray();

    const [avgObs] = await db.collection("annotations").aggregate([
      { $match: filter },
      { $project: { n: { $add: [{ $size: { $ifNull: ["$selectedObjectsID", []] } }, { $size: { $ifNull: ["$newObjects", []] } }] } } },
      { $group: { _id: null, avg: { $avg: "$n" }, total: { $sum: "$n" } } },
    ]).toArray() || [null];

    return res.status(200).json({
      city: citySlug ? req.query.city : "All Areas",
      totalImages,
      totalAnnotations: annStats?.total ?? 0,
      avgAccessibilityRating: annStats ? parseFloat(annStats.avgRating?.toFixed(1)) : 0,
      totalContributors: annStats?.users?.length ?? 0,
      avgObstructionsPerImage: parseFloat(avgObs?.avg?.toFixed(1)) || 0,
      totalObstructions: avgObs?.total ?? 0,
      commonObstructions: obstructions.map((o) => ({ type: o._id, count: o.count })),
    });
  } catch (error) {
    console.error("Failed to fetch public stats:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
