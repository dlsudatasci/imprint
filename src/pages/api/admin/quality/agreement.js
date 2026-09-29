/**
 * GET /api/admin/quality/agreement — inter-annotator agreement matrix.
 *
 * For images annotated by 2+ contributors, computes pairwise box F1,
 * obstruction agreement, and scene-level agreement. Returns per-pair
 * stats and an overall summary (mean F1, mean obstruction, mean scene).
 */
import { requireAdmin } from "@/util/adminAuth";
import { computePairwiseAgreement } from "@/util/validators/qualityMetrics";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const { db } = auth;

  const sharedImages = await db
    .collection("annotations")
    .aggregate([
      { $match: { status: "completed", source: "contributor" } },
      { $group: { _id: "$imageID", users: { $addToSet: "$userId" }, count: { $sum: 1 } } },
      { $match: { count: { $gte: 2 } } },
    ])
    .toArray();

  if (sharedImages.length === 0) {
    return res.status(200).json({
      sharedImageCount: 0,
      pairCount: 0,
      pairs: [],
      summary: null,
    });
  }

  const sharedImageIDs = sharedImages.map((s) => s._id);

  const annotations = await db
    .collection("annotations")
    .find({ imageID: { $in: sharedImageIDs }, status: "completed", source: "contributor" })
    .toArray();

  const byImage = new Map();
  for (const ann of annotations) {
    if (!byImage.has(ann.imageID)) byImage.set(ann.imageID, []);
    byImage.get(ann.imageID).push(ann);
  }

  const allUserIds = new Set();
  for (const ann of annotations) allUserIds.add(ann.userId);

  const userDocs = await db
    .collection("users")
    .find({}, { projection: { _id: 1, username: 1 } })
    .toArray();
  const usernameMap = new Map();
  for (const u of userDocs) usernameMap.set(String(u._id), u.username);

  const pairAgreements = new Map();

  for (const [imageID, anns] of byImage) {
    for (let i = 0; i < anns.length; i++) {
      for (let j = i + 1; j < anns.length; j++) {
        const userA = anns[i].userId;
        const userB = anns[j].userId;
        const pairKey = [userA, userB].sort().join("__");

        if (!pairAgreements.has(pairKey)) {
          pairAgreements.set(pairKey, { userA, userB, images: [] });
        }

        const agreement = computePairwiseAgreement(anns[i], anns[j]);
        pairAgreements.get(pairKey).images.push({ imageID, ...agreement });
      }
    }
  }

  const pairs = [];
  let totalF1 = 0;
  let totalObAgreement = 0;
  let obCount = 0;
  let totalSceneAgreement = 0;
  let sceneCount = 0;

  for (const [, data] of pairAgreements) {
    const avgF1 = data.images.reduce((s, r) => s + r.f1, 0) / data.images.length;

    const obRates = data.images
      .map((r) => r.obstructionAgreement.rate)
      .filter((r) => r !== null);
    const avgOb = obRates.length > 0
      ? obRates.reduce((a, b) => a + b, 0) / obRates.length
      : null;

    const sceneRates = data.images
      .map((r) => r.sceneLevelAgreement.overallRate)
      .filter((r) => r !== null);
    const avgScene = sceneRates.length > 0
      ? sceneRates.reduce((a, b) => a + b, 0) / sceneRates.length
      : null;

    totalF1 += avgF1;
    if (avgOb !== null) { totalObAgreement += avgOb; obCount++; }
    if (avgScene !== null) { totalSceneAgreement += avgScene; sceneCount++; }

    pairs.push({
      userA: usernameMap.get(data.userA) || data.userA,
      userB: usernameMap.get(data.userB) || data.userB,
      sharedImages: data.images.length,
      avgF1: +avgF1.toFixed(4),
      avgObstructionAgreement: avgOb !== null ? +avgOb.toFixed(4) : null,
      avgSceneAgreement: avgScene !== null ? +avgScene.toFixed(4) : null,
    });
  }

  pairs.sort((a, b) => b.sharedImages - a.sharedImages);

  const pairTotal = pairs.length;
  const summary = pairTotal > 0 ? {
    meanF1: +(totalF1 / pairTotal).toFixed(4),
    meanObstructionAgreement: obCount > 0 ? +(totalObAgreement / obCount).toFixed(4) : null,
    meanSceneAgreement: sceneCount > 0 ? +(totalSceneAgreement / sceneCount).toFixed(4) : null,
  } : null;

  return res.status(200).json({
    sharedImageCount: sharedImages.length,
    pairCount: pairs.length,
    pairs,
    summary,
  });
}
