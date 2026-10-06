/**
 * GET /api/admin/nasa-tlx-summary — aggregated NASA-TLX workload scores.
 *
 * Returns submitted/dismissed counts, dismissal rate, and average score
 * for each of the six NASA-TLX scales across all contributor submissions.
 * Rows written by annotator accounts are left out, since annotators are not
 * prompted (decided 3 Oct 2026) and any existing rows predate that.
 */
import { requireAdmin } from "@/util/adminAuth";
import { NASA_TLX_SCALES } from "@/util/validators/nasaTlx";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const { db } = auth;

  // nasa_tlx.userId is written from the session id, so match both the string
  // and the ObjectId form, as accounts.js does
  const annotators = await db
    .collection("users")
    .find({ role: "annotator" }, { projection: { _id: 1 } })
    .toArray();
  const annotatorIds = annotators.flatMap(({ _id }) => [_id.toString(), _id]);
  const notAnnotator = { userId: { $nin: annotatorIds } };

  const [totalSubmitted, totalDismissed, scaleAverages] = await Promise.all([
    db.collection("nasa_tlx").countDocuments({ dismissed: false, ...notAnnotator }),
    db.collection("nasa_tlx").countDocuments({ dismissed: true, ...notAnnotator }),

    db.collection("nasa_tlx").aggregate([
      { $match: { dismissed: false, ...notAnnotator } },
      {
        $group: {
          _id: null,
          ...Object.fromEntries(
            NASA_TLX_SCALES.map((s) => [
              s.key,
              { $avg: `$responses.${s.key}` },
            ])
          ),
        },
      },
    ]).toArray(),
  ]);

  const totalResponses = totalSubmitted + totalDismissed;
  const dismissalRate = totalResponses > 0
    ? +(totalDismissed / totalResponses * 100).toFixed(1)
    : 0;

  const averages = {};
  if (scaleAverages[0]) {
    for (const scale of NASA_TLX_SCALES) {
      averages[scale.key] = scaleAverages[0][scale.key] != null
        ? +scaleAverages[0][scale.key].toFixed(1)
        : null;
    }
  }

  return res.status(200).json({
    totalSubmitted,
    totalDismissed,
    totalResponses,
    dismissalRate,
    averages,
  });
}
