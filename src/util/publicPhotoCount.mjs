/**
 * The public photo count (S33, 17 Nov 2026): photos finished by contributors,
 * the figure under the map on the landing page. `/api/publicStats` matches on
 * this filter and the community milestone emails count with it, so the email
 * and the site cannot disagree. Plain Node, no `@/` imports.
 *
 * It is every annotation that is not an annotator's, as the site has always
 * counted: a photo saved in a session still open is in it.
 */
/** The filter as a fresh object, with a city's when one is given. */
export function publicPhotoFilter(extra = {}) {
  return { ...extra, source: { $ne: "annotator" } };
}

/** How many photos the public site says contributors have finished. */
export function publicPhotoCount(db) {
  return db.collection("annotations").countDocuments(publicPhotoFilter());
}
