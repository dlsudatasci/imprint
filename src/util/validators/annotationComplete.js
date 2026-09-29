export function sanitizeReportedTotal(total, fallback) {
  return Number.isFinite(Number(total))
    ? Math.max(0, Math.trunc(Number(total)))
    : fallback;
}
