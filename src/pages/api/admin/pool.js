/**
 * GET /api/admin/pool — image pool status by city.
 *
 * Returns served/reserve counts per city, image coverage buckets (how many
 * images have 0, 1, 2, or 3+ annotations), and exhaustion warnings for
 * cities with fewer than 50 served images remaining.
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

  const [poolByCity, coverageBuckets] = await Promise.all([
    db.collection("Image").aggregate([
      {
        $group: {
          _id: { city: "$city", poolStatus: "$poolStatus" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.city": 1 } },
    ]).toArray(),

    db.collection("Image").aggregate([
      {
        $addFields: {
          annotationCount: { $ifNull: ["$annotationCount", 0] },
        },
      },
      {
        $bucket: {
          groupBy: "$annotationCount",
          boundaries: [0, 1, 2, 3],
          default: "3+",
          output: { count: { $sum: 1 } },
        },
      },
    ]).toArray(),
  ]);

  const cities = {};
  for (const row of poolByCity) {
    const city = row._id.city || "unknown";
    const status = row._id.poolStatus || "served";
    if (!cities[city]) cities[city] = { city, served: 0, reserve: 0 };
    if (status === "served") cities[city].served = row.count;
    else if (status === "reserve") cities[city].reserve = row.count;
  }

  const cityList = Object.values(cities).sort((a, b) => a.city.localeCompare(b.city));

  const exhaustionWarnings = cityList
    .filter((c) => c.served > 0 && c.served < 50)
    .map((c) => ({ city: c.city, served: c.served }));

  const coverage = {};
  for (const b of coverageBuckets) {
    const label = b._id === "3+" ? "3+" : String(b._id);
    coverage[label] = b.count;
  }

  return res.status(200).json({
    cities: cityList,
    coverage,
    exhaustionWarnings,
  });
}
