import { cityDisplayName } from "@/util/cities";
import { NOT_AN_OBJECT } from "@/util/suggestionJudgment";

export function bucketChartData(chartData) {
  if (!chartData || chartData.length <= 5) return chartData;

  const chunkSize = chartData.length / 5;
  const bucketed = [];
  for (let i = 0; i < 5; i++) {
    const start = Math.floor(i * chunkSize);
    const end = Math.floor((i + 1) * chunkSize);
    const chunk = chartData.slice(start, end);
    const sum = chunk.reduce((a, b) => a + b, 0);
    bucketed.push(Math.round(sum / (chunk.length || 1)));
  }
  return bucketed;
}

/**
 * A city slug as the dashboard shows it. Until 17 Oct 2026 only "laspinas"
 * was corrected, so a session in Quezon City read "quezoncity".
 */
export function normalizeCityDisplay(slug) {
  if (typeof slug !== "string") return "Unknown";
  return cityDisplayName(slug) || "Unknown";
}

/**
 * Obstructions in one annotation: its boxes answered Yes to "does it obstruct
 * the sidewalk?", suggestions and drawn boxes alike. The same rule as the
 * landing page's figures (validators/publicStats.js, OBSTRUCTION_COND). The
 * dashboard's chart used to count every box ruled on, No and Not an object
 * included (17 Oct 2026).
 */
export function countObstructions(annotation) {
  const boxes = [...(annotation?.selectedObjectsID ?? []), ...(annotation?.newObjects ?? [])];
  return boxes.filter((b) => b && b.obstructs === true && b.comment !== NOT_AN_OBJECT).length;
}
