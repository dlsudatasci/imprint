/**
 * GET /api/admin/quality/reference-performance — per-contributor accuracy on
 * reference images, scored against the whole annotation team (Option B,
 * decided 2 Oct 2026, pipeline_methodology.md 7l).
 *
 * For each reference image the annotators' answers (Image.referenceGroundTruth,
 * one entry per annotator, the latest if there are several) are merged into one
 * answer key: an object counts when more than half of the annotators boxed it.
 * Contributors' boxes and categories are scored against that key (precision,
 * recall, F1). Their obstruction, severity and scene answers are compared with
 * each annotator in turn and averaged. Until 2 Oct 2026 this compared every
 * contributor with the first annotator's answers only.
 *
 * Boxes under the minimum size (about 20 by 20 pixels at the model's 640 pixel
 * size, the retraining export's rule) are left out on both sides from 6 Oct
 * 2026, so the image's width and height are loaded. answerKey.boxesBelowMinimumSize
 * counts the annotator boxes left out.
 *
 * Recall counts only the answer-key objects within each contributor's task
 * from 8 Nov 2026 (S21, pipeline_methodology.md 7x): those overlapping a
 * suggestion the contributor was shown, and those most of their annotators
 * said obstruct. Precision still counts every box, and F1 comes from the two.
 * The response says so with recallRule: "in-task". Per contributor it sums
 * inTaskObjects, outOfTaskObjects, truePositivesOutOfTask (boxes that matched
 * an object outside the task, counted for precision only),
 * imagesWithoutInTaskObjects (recall and F1 null there) and
 * suggestionsWithoutInitialState (suggestions saved before S5, matched by
 * their own box). answerKey.objectsMostlyObstructing counts the objects most
 * annotators said obstruct, which does not depend on the contributor.
 */
import { requireAdmin } from "@/util/adminAuth";
import { ObjectId } from "mongodb";
import {
  IOU_THRESHOLD,
  buildReferenceStandard,
  computeReferencePerformanceAgainstTeam,
  latestAnnotatorEntries,
  mostlyObstructs,
} from "@/util/validators/qualityMetrics";

const RECALL_RULE = "in-task";

const sum = (scores, key) => scores.reduce((n, s) => n + (s[key] ?? 0), 0);

const mean = (values) => {
  const v = values.filter((x) => x != null);
  return v.length === 0 ? null : +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(4);
};

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
      { projection: { imageID: 1, referenceGroundTruth: 1, width: 1, height: 1 } }
    )
    .toArray();

  const refImageIDs = refImages.map((img) => img.imageID);
  if (refImageIDs.length === 0) {
    return res.status(200).json({ contributors: [], referenceImageCount: 0, imagesWithGroundTruth: 0, answerKey: null, recallRule: RECALL_RULE });
  }

  // Answer key per image, built once from every annotator who annotated it.
  const teamByImage = new Map();
  let objects = 0, mostlyObstructing = 0, uncertain = 0, ties = 0, belowMinimumSize = 0, minAnnotators = Infinity, maxAnnotators = 0;
  for (const img of refImages) {
    const entries = latestAnnotatorEntries(img.referenceGroundTruth);
    if (entries.length === 0) continue;
    const standard = buildReferenceStandard(entries, IOU_THRESHOLD, { width: img.width, height: img.height });
    teamByImage.set(img.imageID, { entries, standard });
    objects += standard.objects.length;
    mostlyObstructing += standard.objects.filter(mostlyObstructs).length;
    uncertain += standard.uncertain.length;
    ties += standard.ties;
    belowMinimumSize += standard.belowMinimumSize;
    minAnnotators = Math.min(minAnnotators, entries.length);
    maxAnnotators = Math.max(maxAnnotators, entries.length);
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
    const scores = [];
    for (const ann of annotations) {
      const team = teamByImage.get(ann.imageID);
      if (!team) continue;
      scores.push(computeReferencePerformanceAgainstTeam(ann, team.entries, team.standard));
    }
    if (scores.length === 0) continue;

    contributors.push({
      userId,
      username: usernameMap.get(String(userId)) || userId,
      referenceImagesScored: scores.length,
      avgPrecision: mean(scores.map((s) => s.precision)),
      avgRecall: mean(scores.map((s) => s.recall)),
      avgF1: mean(scores.map((s) => s.f1)),
      avgObstructionAgreement: mean(scores.map((s) => s.obstructionAgreement)),
      boxesOnUncertainObjects: sum(scores, "ignoredOnUncertain"),
      inTaskObjects: sum(scores, "inTaskObjects"),
      outOfTaskObjects: sum(scores, "outOfTaskObjects"),
      truePositivesOutOfTask: sum(scores, "truePositivesOutOfTask"),
      imagesWithoutInTaskObjects: scores.filter((s) => s.inTaskObjects === 0).length,
      suggestionsWithoutInitialState: sum(scores, "suggestionsWithoutInitialState"),
    });
  }

  contributors.sort((a, b) => (b.avgF1 ?? -1) - (a.avgF1 ?? -1));

  return res.status(200).json({
    contributors,
    referenceImageCount: refImageIDs.length,
    imagesWithGroundTruth: teamByImage.size,
    answerKey: {
      objects,
      objectsMostlyObstructing: mostlyObstructing,
      uncertain,
      categoryTies: ties,
      boxesBelowMinimumSize: belowMinimumSize,
      annotatorsPerImage: teamByImage.size ? { min: minAnnotators, max: maxAnnotators } : null,
    },
    recallRule: RECALL_RULE,
  });
}
