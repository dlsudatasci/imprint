import { NOT_AN_OBJECT } from "@/util/suggestionJudgment";

/**
 * What the landing page's figures count as an obstruction (15 Oct 2026).
 *
 * Every box a contributor submits carries their answer to "does it obstruct
 * the sidewalk?" as `obstructs: true | false`, the model's suggestions in
 * selectedObjectsID (answered Yes or No) and their own boxes in newObjects
 * (annotationSubmit requires the answer on both). An obstruction is a box
 * answered Yes. Before this, every labelled box was counted, so objects
 * answered No showed under "Common Obstructions" and in the average per
 * image, and a box was also counted on an `isObstruction` field that nothing
 * has written since the obstruction question replaced it.
 *
 * Both figures use the one rule below, so they cannot disagree.
 */

/** The rule as a MongoDB expression over one box, `$$b` */
export const OBSTRUCTION_COND = Object.freeze({
  $and: [{ $eq: ["$$b.obstructs", true] }, { $ne: ["$$b.comment", NOT_AN_OBJECT] }],
});

/** One annotation's obstructions: its suggestions and drawn boxes answered Yes */
export const ANNOTATION_OBSTRUCTIONS = Object.freeze({
  $filter: {
    input: { $concatArrays: [{ $ifNull: ["$selectedObjectsID", []] }, { $ifNull: ["$newObjects", []] }] },
    as: "b",
    cond: OBSTRUCTION_COND,
  },
});

/** The five most common obstructions, by category, among the annotations `filter` matches */
export function commonObstructionsPipeline(filter) {
  return [
    { $match: filter },
    { $project: { boxes: ANNOTATION_OBSTRUCTIONS } },
    { $unwind: "$boxes" },
    { $group: { _id: { $ifNull: ["$boxes.comment", "Unknown"] }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ];
}

/** Obstructions per annotated image, on average, and in all */
export function obstructionsPerImagePipeline(filter) {
  return [
    { $match: filter },
    { $project: { n: { $size: ANNOTATION_OBSTRUCTIONS } } },
    { $group: { _id: null, avg: { $avg: "$n" }, total: { $sum: "$n" } } },
  ];
}
