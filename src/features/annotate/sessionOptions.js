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
export const CONTRIBUTOR_OPTIONS = [
  { count: 5, label: "05", time: "2-3 minutes" },
  { count: 10, label: "10", time: "4-7 minutes" },
  { count: 20, label: "20", time: "8-10 minutes" },
  { count: 40, label: "40", time: "12-15 minutes" },
];

export function sessionOptionsFor(sizes, { annotator = false } = {}) {
  const valid = Array.isArray(sizes) && sizes.length > 0 && sizes.every((n) => Number.isInteger(n) && n > 0);
  if (!valid) return CONTRIBUTOR_OPTIONS;
  return sizes.map((count) => {
    const known = annotator ? null : CONTRIBUTOR_OPTIONS.find((o) => o.count === count);
    return known || { count, label: String(count).padStart(2, "0"), time: null };
  });
}
