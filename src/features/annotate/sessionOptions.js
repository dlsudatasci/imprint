/**
 * Batch-size choices for the session picker (selection.jsx).
 *
 * The server decides which sizes a person may choose (contributors 5, 10, 20,
 * 40; annotators 10, 25, 50, see ALLOWED_SESSION_SIZES and
 * ANNOTATOR_SESSION_SIZES in src/util/validators/annotationGet.js) and sends
 * them as `sessionSizes`. Until that answer arrives, or if it is missing, the
 * contributor list is shown. The time estimates are for contributor sessions,
 * so sizes without one show none.
 */
import { FIRST_SESSION } from "./firstSession.mjs";

export { FIRST_SESSION };

/**
 * The times (S29, 16 Nov 2026) come from the telemetry: contributors' photos
 * since S27 went live (13 Nov 2026, 14:50 Manila) took a median of 46 s and a
 * mean of 57 s a photo (photos up to 10 minutes), from 123 photos by 12
 * contributors, measured from the Coolify app terminal on 16 Nov 2026. So a
 * range runs from 46 to 57 s a photo, rounded. They were 2-3, 4-7, 8-10 and
 * 12-15 minutes before. The 5-photo range ends at FIRST_SESSION.minutes, the
 * figure the campaign emails give.
 */
export const CONTRIBUTOR_OPTIONS = [
  { count: FIRST_SESSION.photos, label: "05", time: `4-${FIRST_SESSION.minutes} minutes` },
  { count: 10, label: "10", time: "8-10 minutes" },
  { count: 20, label: "20", time: "15-20 minutes" },
  { count: 40, label: "40", time: "30-40 minutes" },
];

export function sessionOptionsFor(sizes, { annotator = false } = {}) {
  const valid = Array.isArray(sizes) && sizes.length > 0 && sizes.every((n) => Number.isInteger(n) && n > 0);
  if (!valid) return CONTRIBUTOR_OPTIONS;
  return sizes.map((count) => {
    const known = annotator ? null : CONTRIBUTOR_OPTIONS.find((o) => o.count === count);
    return known || { count, label: String(count).padStart(2, "0"), time: null };
  });
}
