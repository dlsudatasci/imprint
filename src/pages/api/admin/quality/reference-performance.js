/**
 * GET /api/admin/quality/reference-performance — per-contributor accuracy
 * against annotator ground truth on reference images.
 *
 * Compares each contributor's annotations on reference images to the
 * annotator's ground truth using IoU-based box matching. Returns precision,
 * recall, F1, obstruction agreement, severity MAE, and scene agreement.
 */
import { requireAdmin } from "@/util/adminAuth";
import { ObjectId } from "mongodb";
import { computeReferencePerformance } from "@/util/validators/qualityMetrics";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const { db } = auth;

  const refImages = await db
    .collection("Image")
    .find(
      { isReference: true, referenceGroundTruth: { $exists: true, $ne: [] } },
      { projection: { imageID: 1, referenceGroundTruth: 1 } }
    )
    .toArray();

  const refImageIDs = refImages.map((img) => img.imageID);
  if (refImageIDs.length === 0) {
    return res.status(200).json({ contributors: [], referenceImageCount: 0 });
  }

  const groundTruthByImage = new Map();
  for (const img of refImages) {
    const annotatorEntry = img.referenceGroundTruth.find((e) => e.source === "annotator");
    if (annotatorEntry) {
      groundTruthByImage.set(img.imageID, annotatorEntry);
    }
  }

  const contributorAnnotations = await db
    .collection("annotations")
    .find({
      imageID: { $in: refImageIDs },
      source: "contributor",
      status: "completed",
    })
    .toArray();

  const byContributor = new Map();
  for (const ann of contributorAnnotations) {
    if (!byContributor.has(ann.userId)) byContributor.set(ann.userId, []);
    byContributor.get(ann.userId).push(ann);
  }

  const userIds = [...byContributor.keys()];
  const userDocs = await db
    .collection("users")
    .find(
      { _id: { $in: userIds.map((id) => { try { return new ObjectId(id); } catch { return id; } }) } },
      { projection: { _id: 1, username: 1 } }
    )
    .toArray();
  const usernameMap = new Map();
  for (const u of userDocs) usernameMap.set(String(u._id), u.username);

  const contributors = [];

  for (const [userId, annotations] of byContributor) {
    const imageScores = [];

    for (const ann of annotations) {
      const gt = groundTruthByImage.get(ann.imageID);
      if (!gt) continue;

      const score = computeReferencePerformance(ann, gt);
      imageScores.push({ imageID: ann.imageID, ...score });
    }

    if (imageScores.length === 0) continue;

    const avgF1 = imageScores.reduce((s, r) => s + r.f1, 0) / imageScores.length;
    const avgPrecision = imageScores.reduce((s, r) => s + r.precision, 0) / imageScores.length;
    const avgRecall = imageScores.reduce((s, r) => s + r.recall, 0) / imageScores.length;

    const obRates = imageScores
      .map((r) => r.obstructionAgreement.rate)
      .filter((r) => r !== null);
    const avgObstructionAgreement =
      obRates.length > 0 ? obRates.reduce((a, b) => a + b, 0) / obRates.length : null;

    const sevMAEs = imageScores
      .map((r) => r.severityMAE.mae)
      .filter((m) => m !== null);
    const avgSeverityMAE =
      sevMAEs.length > 0 ? sevMAEs.reduce((a, b) => a + b, 0) / sevMAEs.length : null;

    const sceneRates = imageScores
      .map((r) => r.sceneLevelAgreement.overallRate)
      .filter((r) => r !== null);
    const avgSceneAgreement =
      sceneRates.length > 0 ? sceneRates.reduce((a, b) => a + b, 0) / sceneRates.length : null;

    contributors.push({
      userId,
      username: usernameMap.get(userId) || userId,
      referenceImagesScored: imageScores.length,
      avgPrecision: +avgPrecision.toFixed(4),
      avgRecall: +avgRecall.toFixed(4),
      avgF1: +avgF1.toFixed(4),
      avgObstructionAgreement: avgObstructionAgreement !== null ? +avgObstructionAgreement.toFixed(4) : null,
      avgSeverityMAE: avgSeverityMAE !== null ? +avgSeverityMAE.toFixed(4) : null,
      avgSceneAgreement: avgSceneAgreement !== null ? +avgSceneAgreement.toFixed(4) : null,
    });
  }

  contributors.sort((a, b) => b.avgF1 - a.avgF1);

  return res.status(200).json({
    contributors,
    referenceImageCount: refImageIDs.length,
    imagesWithGroundTruth: groundTruthByImage.size,
  });
}
