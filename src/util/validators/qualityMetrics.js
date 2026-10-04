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

// Only pairs where both sides answered Yes or No are compared. Annotator boxes
// carry obstructs: null from 4 Oct 2026 until the obstruction step exists, and
// a missing answer is not a disagreement.
export function computeObstructionAgreement(matchedPairs) {
  const answered = matchedPairs.filter(
    ({ predicted, groundTruth }) =>
      typeof predicted.obstructs === "boolean" && typeof groundTruth.obstructs === "boolean"
  );
  if (answered.length === 0) return { rate: null, agreed: 0, total: 0 };

  let agreed = 0;
  for (const { predicted, groundTruth } of answered) {
    if (predicted.obstructs === groundTruth.obstructs) agreed++;
  }

  return {
    rate: +(agreed / answered.length).toFixed(4),
    agreed,
    total: answered.length,
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

/**
 * Share of scene-level answers two people gave alike (2 Oct 2026).
 *
 * Sidewalk width is always compared. "None" is one of its answers, so a
 * disagreement about whether a sidewalk exists counts here, once. Surface
 * condition, walking comfort and accessibility are left empty when the width
 * is "None", so they are compared only when both people saw a sidewalk: an
 * answer missing by design is not a disagreement (Krippendorff's alpha, used
 * for the reported analysis, treats it the same way).
 */
export const SCENE_CONDITIONAL_KEYS = Object.freeze(["surfaceCondition", "walkability", "overallAccessibility"]);

export function computeSceneLevelAgreement(sceneA, sceneB) {
  if (!sceneA || !sceneB) return { fields: {}, overallRate: null };

  const fields = {};
  const bothSawSidewalk =
    sceneA.sidewalkWidth != null && sceneA.sidewalkWidth !== "no_sidewalk" &&
    sceneB.sidewalkWidth != null && sceneB.sidewalkWidth !== "no_sidewalk";
  const keys = ["sidewalkWidth", ...(bothSawSidewalk ? SCENE_CONDITIONAL_KEYS : [])];
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
        sw: ann.sceneLevel.sidewalkWidth,
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

/* ------------------------------------------------------------------------- *
 * Reference standard from several annotators (Option B, decided 2 Oct 2026;
 * pipeline_methodology.md 7l). Every annotator boxes every reference image, so
 * their boxes are merged into one answer key:
 *   - two boxes from different annotators mark the same object when their IoU
 *     is at least 0.5, and each annotator contributes at most one box to an
 *     object (strongest overlaps are joined first);
 *   - an object enters the answer key when more than half of the annotators
 *     who annotated the image boxed it, with the median of each edge as its
 *     box and the category most of them chose;
 *   - objects boxed by half or fewer are "uncertain", as are majority objects
 *     whose category is tied (7l leaves ties to the researcher, so the live
 *     dashboard sets them aside and counts them). A contributor box on an
 *     uncertain object counts neither for nor against the contributor.
 * Not-an-object boxes are left out on every side.
 * ------------------------------------------------------------------------- */

function normCategory(c) {
  return typeof c === "string" ? c.trim().toLowerCase().replace(/\s+/g, "_") : null;
}

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function edges(mark) {
  const x = mark?.x ?? 0, y = mark?.y ?? 0;
  return [x, y, x + (mark?.width ?? 0), y + (mark?.height ?? 0)];
}

export function buildReferenceStandard(annotatorAnnotations, threshold = IOU_THRESHOLD) {
  const annotatorCount = annotatorAnnotations.length;
  const boxes = [];
  annotatorAnnotations.forEach((ann, a) => {
    for (const box of allBoxes(ann)) boxes.push({ a, box });
  });

  const links = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].a === boxes[j].a) continue;
      const iou = computeIoU(boxes[i].box.mark, boxes[j].box.mark);
      if (iou >= threshold) links.push({ i, j, iou });
    }
  }
  links.sort((p, q) => q.iou - p.iou || p.i - q.i || p.j - q.j);

  const parent = boxes.map((_, i) => i);
  const annotators = boxes.map((b) => new Set([b.a]));
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const { i, j } of links) {
    const ri = find(i), rj = find(j);
    if (ri === rj) continue;
    if ([...annotators[ri]].some((a) => annotators[rj].has(a))) continue;
    parent[rj] = ri;
    for (const a of annotators[rj]) annotators[ri].add(a);
  }

  const clusters = new Map();
  boxes.forEach((b, i) => {
    const r = find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r).push(b.box);
  });

  const objects = [];
  const uncertain = [];
  let ties = 0;
  for (const members of clusters.values()) {
    const e = members.map((m) => edges(m.mark));
    const [x1, y1, x2, y2] = [0, 1, 2, 3].map((k) => median(e.map((v) => v[k])));
    const mark = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    const votes = members.length;

    if (votes * 2 <= annotatorCount) {
      uncertain.push({ mark, votes, reason: "minority" });
      continue;
    }
    const counts = new Map();
    for (const m of members) {
      const c = normCategory(m.comment);
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    const top = Math.max(...counts.values());
    const leaders = [...counts.entries()].filter(([, n]) => n === top);
    if (leaders.length > 1) {
      ties++;
      uncertain.push({ mark, votes, reason: "category_tie" });
      continue;
    }
    objects.push({ mark, comment: leaders[0][0], votes });
  }

  return { annotatorCount, objects, uncertain, ties };
}

/**
 * Objective layer against the merged answer key (chapter_4.tex line 339): a
 * contributor box is a true positive when its IoU with an answer-key object is
 * at least 0.5 and its category matches. Unmatched contributor boxes on an
 * uncertain object are ignored. An image where both the answer key and the
 * contributor have no boxes gives null scores (nothing to score), not zero.
 */
export function scoreAgainstStandard(contributorAnnotation, standard, threshold = IOU_THRESHOLD) {
  const pred = allBoxes(contributorAnnotation);
  const candidates = [];
  pred.forEach((p, pi) => {
    standard.objects.forEach((o, oi) => {
      if (normCategory(p.comment) !== o.comment) return;
      const iou = computeIoU(p.mark, o.mark);
      if (iou >= threshold) candidates.push({ pi, oi, iou });
    });
  });
  candidates.sort((p, q) => q.iou - p.iou || p.pi - q.pi || p.oi - q.oi);
  const usedP = new Set();
  const usedO = new Set();
  for (const { pi, oi } of candidates) {
    if (usedP.has(pi) || usedO.has(oi)) continue;
    usedP.add(pi);
    usedO.add(oi);
  }

  let falsePositives = 0;
  let ignored = 0;
  pred.forEach((p, pi) => {
    if (usedP.has(pi)) return;
    if (standard.uncertain.some((u) => computeIoU(p.mark, u.mark) >= threshold)) ignored++;
    else falsePositives++;
  });
  const truePositives = usedP.size;
  const falseNegatives = standard.objects.length - usedO.size;

  const empty = truePositives + falsePositives === 0 && falseNegatives === 0;
  const prf1 = empty
    ? { precision: null, recall: null, f1: null }
    : computePRF1(truePositives, truePositives + falsePositives, standard.objects.length);

  return { ...prf1, truePositives, falsePositives, falseNegatives, ignoredOnUncertain: ignored };
}

function meanOrNull(values) {
  const v = values.filter((x) => x != null);
  return v.length === 0 ? null : +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(4);
}

/**
 * One contributor's answers on one reference image, scored against the whole
 * annotation team. Boxes and categories are scored against the merged answer
 * key. Obstruction answers are compared with each annotator in turn and
 * averaged across annotators (chapter_4.tex line 349): objects are paired by
 * one-to-one IoU of at least 0.5 regardless of category, since a wrong
 * category does not change whether that object obstructs. Annotators record
 * neither severity nor scene answers (methodology §7o, 3 Oct 2026), so those
 * are not compared.
 */
export function computeReferencePerformanceAgainstTeam(contributorAnnotation, annotatorAnnotations, standard) {
  const std = standard || buildReferenceStandard(annotatorAnnotations);
  const objective = scoreAgainstStandard(contributorAnnotation, std);
  const pred = allBoxes(contributorAnnotation);

  const perAnnotator = annotatorAnnotations.map((ann) => {
    const { matched } = matchBoxesByIoU(pred, allBoxes(ann));
    return computeObstructionAgreement(matched).rate;
  });

  return {
    ...objective,
    answerKeyObjects: std.objects.length,
    uncertainObjects: std.uncertain.length,
    annotatorCount: std.annotatorCount,
    obstructionAgreement: meanOrNull(perAnnotator),
  };
}

/** One entry per annotator, keeping the most recent if an annotator appears twice. */
export function latestAnnotatorEntries(referenceGroundTruth = []) {
  const byUser = new Map();
  for (const e of referenceGroundTruth) {
    if (!e || e.source !== "annotator") continue;
    const key = String(e.userId);
    const prev = byUser.get(key);
    if (!prev || new Date(e.submittedAt || 0) >= new Date(prev.submittedAt || 0)) byUser.set(key, e);
  }
  return [...byUser.values()];
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
