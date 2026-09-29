import { excludeNotAnObject } from "@/util/suggestionJudgment";

/**
 * Quality-control metrics: IoU-based box matching, precision/recall/F1,
 * obstruction agreement, severity MAE, scene-level agreement, degenerate
 * behavior detection, and pairwise inter-annotator agreement.
 */
export const IOU_THRESHOLD = 0.5;
export const DEGENERATE_MIN_IMAGES = 10;
export const FAST_SUBMISSION_THRESHOLD_MS = 5000;

export function computeIoU(a, b) {
  if (!a || !b) return 0;
  const ax = a.x ?? 0, ay = a.y ?? 0, aw = a.width ?? 0, ah = a.height ?? 0;
  const bx = b.x ?? 0, by = b.y ?? 0, bw = b.width ?? 0, bh = b.height ?? 0;

  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (intersection === 0) return 0;

  const union = aw * ah + bw * bh - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function matchBoxesByIoU(predicted, groundTruth, threshold = IOU_THRESHOLD) {
  const matched = [];
  const usedGT = new Set();
  const usedPred = new Set();

  const candidates = [];
  for (let pi = 0; pi < predicted.length; pi++) {
    for (let gi = 0; gi < groundTruth.length; gi++) {
      const iou = computeIoU(predicted[pi].mark, groundTruth[gi].mark);
      if (iou >= threshold) {
        candidates.push({ pi, gi, iou });
      }
    }
  }

  candidates.sort((a, b) => b.iou - a.iou);

  for (const { pi, gi, iou } of candidates) {
    if (usedPred.has(pi) || usedGT.has(gi)) continue;
    usedPred.add(pi);
    usedGT.add(gi);
    matched.push({ predicted: predicted[pi], groundTruth: groundTruth[gi], iou });
  }

  return {
    matched,
    unmatchedPredicted: predicted.filter((_, i) => !usedPred.has(i)),
    unmatchedGroundTruth: groundTruth.filter((_, i) => !usedGT.has(i)),
  };
}

export function computePRF1(matchedCount, predictedCount, groundTruthCount) {
  const precision = predictedCount === 0 ? 0 : matchedCount / predictedCount;
  const recall = groundTruthCount === 0 ? 0 : matchedCount / groundTruthCount;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    precision: +precision.toFixed(4),
    recall: +recall.toFixed(4),
    f1: +f1.toFixed(4),
  };
}

export function computeObstructionAgreement(matchedPairs) {
  if (matchedPairs.length === 0) return { rate: null, agreed: 0, total: 0 };

  let agreed = 0;
  for (const { predicted, groundTruth } of matchedPairs) {
    if (predicted.obstructs === groundTruth.obstructs) agreed++;
  }

  return {
    rate: +(agreed / matchedPairs.length).toFixed(4),
    agreed,
    total: matchedPairs.length,
  };
}

export function computeSeverityMAE(matchedPairs) {
  const withSeverity = matchedPairs.filter(
    (p) => p.predicted.severity != null && p.groundTruth.severity != null
  );
  if (withSeverity.length === 0) return { mae: null, count: 0 };

  let sum = 0;
  for (const { predicted, groundTruth } of withSeverity) {
    sum += Math.abs(predicted.severity - groundTruth.severity);
  }

  return {
    mae: +(sum / withSeverity.length).toFixed(4),
    count: withSeverity.length,
  };
}

export function computeSceneLevelAgreement(sceneA, sceneB) {
  if (!sceneA || !sceneB) return { fields: {}, overallRate: null };

  const fields = {};
  const keys = ["sidewalkPresent", "surfaceCondition", "walkability", "overallAccessibility"];
  let agreed = 0;
  let compared = 0;

  for (const key of keys) {
    const a = sceneA[key];
    const b = sceneB[key];
    if (a == null && b == null) continue;
    compared++;
    const match = a === b;
    if (match) agreed++;
    fields[key] = { a, b, match };
  }

  return {
    fields,
    overallRate: compared === 0 ? null : +(agreed / compared).toFixed(4),
  };
}

function allBoxes(annotation) {
  return excludeNotAnObject([
    ...(annotation.selectedObjectsID || []),
    ...(annotation.newObjects || []),
  ]);
}

export function computeReferencePerformance(contributorAnnotation, groundTruthAnnotation) {
  const predBoxes = allBoxes(contributorAnnotation);
  const gtBoxes = allBoxes(groundTruthAnnotation);

  const { matched, unmatchedPredicted, unmatchedGroundTruth } =
    matchBoxesByIoU(predBoxes, gtBoxes);

  const prf1 = computePRF1(matched.length, predBoxes.length, gtBoxes.length);
  const obstructionAgreement = computeObstructionAgreement(matched);
  const severityMAE = computeSeverityMAE(matched);
  const sceneLevelAgreement = computeSceneLevelAgreement(
    contributorAnnotation.sceneLevel,
    groundTruthAnnotation.sceneLevel
  );

  return {
    ...prf1,
    matchedBoxes: matched.length,
    contributorBoxCount: predBoxes.length,
    groundTruthBoxCount: gtBoxes.length,
    unmatchedContributor: unmatchedPredicted.length,
    unmatchedGroundTruth: unmatchedGroundTruth.length,
    obstructionAgreement,
    severityMAE,
    sceneLevelAgreement,
  };
}

export function detectDegenerateFlags(annotations, telemetryEvents) {
  const flags = [];

  if (annotations.length < DEGENERATE_MIN_IMAGES) return flags;

  const obstructionValues = [];
  const severityValues = [];
  const scenePatterns = [];

  for (const ann of annotations) {
    const boxes = allBoxes(ann);
    for (const box of boxes) {
      if (typeof box.obstructs === "boolean") obstructionValues.push(box.obstructs);
      if (box.severity != null) severityValues.push(box.severity);
    }

    if (ann.sceneLevel) {
      scenePatterns.push(JSON.stringify({
        sp: ann.sceneLevel.sidewalkPresent,
        sc: ann.sceneLevel.surfaceCondition,
        w: ann.sceneLevel.walkability,
        oa: ann.sceneLevel.overallAccessibility,
      }));
    }
  }

  if (obstructionValues.length >= DEGENERATE_MIN_IMAGES) {
    const allTrue = obstructionValues.every((v) => v === true);
    const allFalse = obstructionValues.every((v) => v === false);
    if (allTrue) flags.push({ type: "all_obstructs_yes", count: obstructionValues.length });
    if (allFalse) flags.push({ type: "all_obstructs_no", count: obstructionValues.length });
  }

  if (severityValues.length >= DEGENERATE_MIN_IMAGES) {
    const allSame = severityValues.every((v) => v === severityValues[0]);
    if (allSame) flags.push({ type: "constant_severity", value: severityValues[0], count: severityValues.length });
  }

  if (scenePatterns.length >= DEGENERATE_MIN_IMAGES) {
    const allSame = scenePatterns.every((p) => p === scenePatterns[0]);
    if (allSame) flags.push({ type: "identical_scene_ratings", count: scenePatterns.length });
  }

  if (telemetryEvents && telemetryEvents.length >= DEGENERATE_MIN_IMAGES) {
    const durations = telemetryEvents
      .map((e) => e.imageDurationMs)
      .filter((d) => d != null && d > 0);
    if (durations.length >= DEGENERATE_MIN_IMAGES) {
      const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
      if (mean < FAST_SUBMISSION_THRESHOLD_MS) {
        flags.push({ type: "impossibly_fast", meanMs: Math.round(mean), count: durations.length });
      }
    }
  }

  return flags;
}

export function computePairwiseAgreement(annotationsA, annotationsB) {
  const boxesA = allBoxes(annotationsA);
  const boxesB = allBoxes(annotationsB);

  const { matched } = matchBoxesByIoU(boxesA, boxesB);
  const prf1 = computePRF1(matched.length, boxesA.length, boxesB.length);
  const obstructionAgreement = computeObstructionAgreement(matched);
  const sceneLevelAgreement = computeSceneLevelAgreement(
    annotationsA.sceneLevel,
    annotationsB.sceneLevel
  );

  return { ...prf1, obstructionAgreement, sceneLevelAgreement };
}
