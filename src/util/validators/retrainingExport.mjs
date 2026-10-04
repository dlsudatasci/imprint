import { createHash } from "node:crypto";

export const RETRAINING_TAXONOMY = new Set([
  "bench", "bicycle", "bollard", "car", "construction_materials",
  "electrical_box", "fire_hydrant", "garbage", "lamp_post",
  "motorcycle", "movable_signage", "potted_plant", "street_sign",
  "street_vendor_cart", "trash_bin", "tree", "tricycle", "utility_post",
]);

export const NOT_AN_OBJECT = "not_an_object";

export const RETRAINING_CSV_KEYS = [
  "imageID", "objectKey", "objectID", "source", "isCreatedBox", "featureSource",
  "category", "boxX", "boxY", "boxW", "boxH", "confidence",
  "finalCategory", "finalBoxX", "finalBoxY", "finalBoxW", "finalBoxH",
  "obstructs", "severity",
  "userMobilityDisability", "userAgeGroup", "userCommuteFrequency",
  "userAccessibilityFamiliarity", "userWalkingFrequency", "userTemporaryMobility",
  "servedModelVersion", "pseudoUserId",
];

export function pseudonymize(userId) {
  return createHash("sha256").update(String(userId)).digest("hex").slice(0, 16);
}

export function toCsvRow(obj, keys) {
  return keys.map((k) => {
    const val = obj[k];
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }).join(",");
}

export function writeCsv(rows, keys) {
  const header = keys.join(",");
  const lines = rows.map((r) => toCsvRow(r, keys));
  return [header, ...lines].join("\n") + "\n";
}

export function buildRetrainingRows({ annotations, userMap, imageMap }) {
  const summary = {
    rows: 0,
    createdBoxRows: 0,
    fallbackRows: 0,
    excludedReferenceAnnotations: 0,
    excludedNotAnObject: 0,
    excludedFreeText: 0,
    excludedNonTaxonomyFeatureCategory: 0,
    excludedNoJudgment: 0,
  };

  const rows = [];

  for (const ann of annotations) {
    const img = imageMap.get(ann.imageID);
    if (img?.isReference) {
      summary.excludedReferenceAnnotations++;
      continue;
    }

    const user = userMap.get(String(ann.userId));
    const boxes = [
      ...(ann.selectedObjectsID || []),
      ...(ann.newObjects || []),
    ];

    for (const box of boxes) {
      const finalCategory = box.comment || box.label || "";

      if (finalCategory === NOT_AN_OBJECT) {
        summary.excludedNotAnObject++;
        continue;
      }

      if (!RETRAINING_TAXONOMY.has(finalCategory)) {
        summary.excludedFreeText++;
        continue;
      }

      const isCreatedBox = box.editable === true;
      let category, featureBox, featureSource;

      if (isCreatedBox) {
        category = finalCategory;
        featureBox = box.mark;
        featureSource = "created";
      } else if (box.initialState) {
        category = box.initialState.comment;
        featureBox = box.initialState.mark;
        featureSource = "pipeline";
      } else {
        category = finalCategory;
        featureBox = box.mark;
        featureSource = "final_fallback";
        summary.fallbackRows++;
      }

      if (!RETRAINING_TAXONOMY.has(category)) {
        summary.excludedNonTaxonomyFeatureCategory++;
        continue;
      }

      // The classifier needs a Yes or No. Annotator boxes carry obstructs: null
      // from 4 Oct 2026 until the obstruction step exists.
      if (typeof box.obstructs !== "boolean") {
        summary.excludedNoJudgment++;
        continue;
      }

      const row = {
        imageID: ann.imageID,
        objectKey: `${ann.imageID}:${box.id}`,
        objectID: box.id || box._id || "",
        source: ann.source || "contributor",
        isCreatedBox,
        featureSource,
        category,
        boxX: featureBox?.x ?? "",
        boxY: featureBox?.y ?? "",
        boxW: featureBox?.width ?? "",
        boxH: featureBox?.height ?? "",
        confidence: box.confidence ?? "",
        finalCategory,
        finalBoxX: box.mark?.x ?? "",
        finalBoxY: box.mark?.y ?? "",
        finalBoxW: box.mark?.width ?? "",
        finalBoxH: box.mark?.height ?? "",
        obstructs: box.obstructs ?? "",
        severity: box.obstructs ? (box.severity ?? "") : "",
        userMobilityDisability: user?.disability ?? "",
        userAgeGroup: user?.age ?? "",
        userCommuteFrequency: user?.commuteFrequency ?? "",
        userAccessibilityFamiliarity: user?.accessibilityFamiliarity ?? "",
        userWalkingFrequency: user?.walkingFrequency ?? "",
        userTemporaryMobility: user?.temporaryMobility ?? "",
        servedModelVersion: ann.servedModelVersion ?? "",
        pseudoUserId: pseudonymize(ann.userId),
      };

      rows.push(row);
      summary.rows++;

      if (isCreatedBox) {
        summary.createdBoxRows++;
      }
    }
  }

  return { rows, summary };
}
