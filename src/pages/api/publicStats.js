import { connectToDatabase } from "@/util/mongodb";

// DB stores cities as lowercase slugs (e.g. "makati", "laspinas").
// This converts display names like "Las Piñas" → "laspinas".
function normalizeCityName(displayName) {
  return displayName.toLowerCase().replace(/ñ/g, "n").replace(/[^a-z0-9]/g, "");
}

// GET /api/publicStats              → global stats
// GET /api/publicStats?city=Makati  → per-city stats
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const { city } = req.query;
  const filter = city ? { city: normalizeCityName(city) } : {};

  try {
    const { db } = await connectToDatabase();

    const totalImages = await db.collection("Image").countDocuments(filter);

    const [annStats] = await db.collection("annotations").aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          avgRating: { $avg: "$accessibilityRating" },
          users: { $addToSet: "$userId" },
        },
      },
    ]).toArray();

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
      city: city || "All Areas",
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
