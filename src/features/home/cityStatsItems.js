import { CATEGORY_OPTIONS } from "@/util/categoryOptions";

/**
 * The figures under the map (CityStats), from /api/publicStats.
 *
 * Fixed 15 Oct 2026, to say what each number is:
 * - Annotations counts annotated images (one record per photo per person),
 *   not bounding boxes.
 * - Accessibility is the average answer to Step 2's "Accessible to Me". From
 *   22 Oct 2026 it runs 1 Not accessible to 5 Easily accessible, so higher is
 *   better (validators/sceneScale.mjs); it was 1 Easily to 5 Not accessible,
 *   and shown without "/5", which then read as a score the wrong way round.
 *   Now a score out of 5 is what it is, and the caption says so plainly
 *   (23 Oct 2026; it said "average, 1 not to 5 easily accessible").
 * - Avg. Obstructions counts only boxes answered Yes (validators/publicStats.js).
 */
export function cityStatsItems(stats) {
  if (!stats) return [];
  return [
    { label: "Sidewalk Images", value: stats.totalImages?.toLocaleString() || "0", sub: "collected for annotation" },
    { label: "Annotations", value: stats.totalAnnotations?.toLocaleString() || "0", sub: "images annotated" },
    { label: "Accessibility", value: stats.avgAccessibilityRating > 0 ? String(stats.avgAccessibilityRating) : "—", sub: "out of 5, higher is better" },
    { label: "Contributors", value: stats.totalContributors?.toLocaleString() || "0", sub: "unique volunteers" },
    { label: "Avg. Obstructions", value: stats.avgObstructionsPerImage > 0 ? String(stats.avgObstructionsPerImage) : "—", sub: "per image" },
  ];
}

const CATEGORY_LABELS = new Map(CATEGORY_OPTIONS.map((o) => [o.value, o.label]));

/**
 * A Common Obstructions entry's name, as the box panel's category list names
 * it ("Street Vendor Cart", 16 Oct 2026). A label typed in with "Other..." is
 * not a taxonomy value and is shown as typed, underscores turned to spaces, as
 * before.
 */
export function obstructionLabel(type) {
  if (typeof type !== "string") return "";
  return CATEGORY_LABELS.get(type) ?? type.replace(/_/g, " ");
}
