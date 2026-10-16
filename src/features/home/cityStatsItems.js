/**
 * The figures under the map (CityStats), from /api/publicStats.
 *
 * Fixed 15 Oct 2026, to say what each number is:
 * - Annotations counts annotated images (one record per photo per person),
 *   not bounding boxes.
 * - Accessibility is the average answer to Step 2's "Accessible to Me", where
 *   1 is Easily accessible and 5 Not accessible, so lower is better. It is
 *   shown without "/5", which read as a score out of 5, and says which way
 *   the scale runs.
 * - Avg. Obstructions counts only boxes answered Yes (validators/publicStats.js).
 */
export function cityStatsItems(stats) {
  if (!stats) return [];
  return [
    { label: "Sidewalk Images", value: stats.totalImages?.toLocaleString() || "0", sub: "collected for annotation" },
    { label: "Annotations", value: stats.totalAnnotations?.toLocaleString() || "0", sub: "images annotated" },
    { label: "Accessibility", value: stats.avgAccessibilityRating > 0 ? String(stats.avgAccessibilityRating) : "—", sub: "average, 1 easily to 5 not accessible" },
    { label: "Contributors", value: stats.totalContributors?.toLocaleString() || "0", sub: "unique volunteers" },
    { label: "Avg. Obstructions", value: stats.avgObstructionsPerImage > 0 ? String(stats.avgObstructionsPerImage) : "—", sub: "per image" },
  ];
}
