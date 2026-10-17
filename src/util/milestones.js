/**
 * Turns a contributor's photo count into a distance they can picture
 * (chapter_5.tex, Motivational Features, relatedness): each photo counts as a
 * fixed length of sidewalk, and the total climbs a ladder of Philippine
 * landmarks.
 *
 * Recalibrated 17 Oct 2026 (IMPRINT_dashboard_audit.md). Before, a photo
 * counted 2 m and the first landmark was the San Juanico Bridge at 2.16 km,
 * so it took 1,080 photos. A contributor can be served at most the 675 photos
 * in the deployment pool, and chapter_4.tex projects about 40 each, so nobody
 * could reach even the first milestone, against chapter 5's "early milestones
 * are attainable". Now a photo counts 10 m, roughly the stretch of sidewalk
 * one street photo shows ahead, and three short Metro Manila landmarks come
 * first: about 40 photos reach the second.
 *
 * Distances are motivational, not survey-grade. Kept in whole metres so the
 * comparisons have no floating-point edge.
 */

/** Sidewalk counted per annotated photo, in metres (Rans, 17 Oct 2026) */
export const METERS_PER_PHOTO = 10;

/**
 * The ladder, shortest first. Every length is from the landmark's English
 * Wikipedia article, read 17 Oct 2026: the infobox figure, or for EDSA the
 * article's text (its page showed no infobox length). `place` reads after
 * "the length of".
 *
 * Changed from the old ladder: three short landmarks added (Jones Bridge,
 * Quezon Bridge, Kalaw Avenue). C-5 corrected from 32.5 km to 43.87 km and
 * Palawan from 450 km to 425 km. "Manila to Tagaytay" and "Manila to Baguio"
 * dropped, since a route distance has no single source. The Pasig River added
 * in their place. EDSA, the San Juanico Bridge, Roxas Boulevard, SCTEX and
 * the Pan-Philippine Highway matched their articles.
 */
export const MILESTONES = Object.freeze([
  Object.freeze({ place: "Jones Bridge", meters: 115 }),
  Object.freeze({ place: "Quezon Bridge", meters: 447 }),
  Object.freeze({ place: "Kalaw Avenue", meters: 1400 }),
  Object.freeze({ place: "the San Juanico Bridge", meters: 2164 }),
  Object.freeze({ place: "Roxas Boulevard", meters: 7600 }),
  Object.freeze({ place: "EDSA", meters: 23800 }),
  Object.freeze({ place: "the Pasig River", meters: 25200 }),
  Object.freeze({ place: "C-5 Road", meters: 43870 }),
  Object.freeze({ place: "SCTEX", meters: 93770 }),
  Object.freeze({ place: "Palawan Island", meters: 425000 }),
  Object.freeze({ place: "the Pan-Philippine Highway", meters: 3379730 }),
]);

/** Metres of sidewalk counted for a number of annotated photos */
export function metersForPhotos(count) {
  const n = Number(count);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) * METERS_PER_PHOTO : 0;
}

/** "400 m" under a kilometre, "2.16 km" from there, in Philippine number style */
export function formatDistance(meters) {
  const m = Math.max(0, Math.round(Number(meters) || 0));
  if (m < 1000) return `${m.toLocaleString("en-PH")} m`;
  return `${(m / 1000).toLocaleString("en-PH", { maximumFractionDigits: 2 })} km`;
}

/** The last milestone already reached, or null before the first */
export function previousMilestone(meters) {
  let reached = null;
  for (const m of MILESTONES) if (m.meters <= meters) reached = m;
  return reached;
}

/**
 * How far along the current step of the ladder, 0 to 100: from the last
 * landmark passed (or the start) to the next one. Measured from zero, the bar
 * toward a far landmark barely moves, so each step gets its own bar.
 */
export function stepProgress(meters) {
  const next = nextMilestone(meters);
  if (!next) return 100;
  const from = previousMilestone(meters)?.meters ?? 0;
  return Math.min(100, Math.max(0, ((meters - from) / (next.meters - from)) * 100));
}

/** The first milestone still ahead, or null once every one is passed */
export function nextMilestone(meters) {
  return MILESTONES.find((m) => m.meters > meters) ?? null;
}

/**
 * The milestone a session crossed, or null if it crossed none.
 *
 * Takes the before and after photo counts so the celebration fires exactly
 * once, on the session that crossed the line (/api/annotationComplete returns
 * both). A long session can clear several at once, since the early ones sit
 * close together, and the largest is the one celebrated.
 */
export function getCrossedMilestone(previousCount, currentCount) {
  const before = metersForPhotos(previousCount);
  const after = metersForPhotos(currentCount);
  let crossed = null;
  for (const milestone of MILESTONES) {
    if (before < milestone.meters && after >= milestone.meters) crossed = milestone;
  }
  return crossed;
}
