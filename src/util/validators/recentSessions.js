import { cityDisplayName } from "@/util/cities";
import { NOT_AN_OBJECT } from "@/util/suggestionJudgment";

/**
 * Recent sessions come five at a time (22 Oct 2026): the five most recent
 * first, then five more each time Show more is pressed. They were the eight
 * most recent and no more.
 */
export const RECENT_SESSIONS_PAGE = 5;
const MAX_PAGE = 20;

/**
 * Which sessions to send, from the request's query: `offset` finished
 * sessions skipped (0 by default) and `limit` sent (RECENT_SESSIONS_PAGE by
 * default, at most 20). Anything that is not a whole number falls back.
 */
export function pageParams(query = {}) {
  const whole = (value) => {
    const n = Number(Array.isArray(value) ? value[0] : value);
    return Number.isInteger(n) ? n : null;
  };
  const offset = whole(query?.offset);
  const limit = whole(query?.limit);
  return {
    offset: offset !== null && offset >= 0 ? offset : 0,
    limit: limit !== null && limit >= 1 ? Math.min(limit, MAX_PAGE) : RECENT_SESSIONS_PAGE,
  };
}

/** Thumbnails sent per session: five, as tablets and desktops show; phones show four (22 Oct 2026) */
export const SESSION_THUMBNAILS = 5;

/**
 * Where a session's photos were, as the dashboard names them (22 Oct 2026):
 * the cities by how many photos each had, most first (ties by name). It said
 * "Several cities" for any session in more than one, which told nothing.
 *
 *   one        "Makati City" (Rans, 22 Oct 2026: "Makati" alone looked
 *              unfinished; every Imprint city is a city, and "Quezon City"
 *              stays as it is)
 *   two        "Makati and San Juan"
 *   three      "Makati, San Juan and Pasig"
 *   four plus  "Makati, San Juan and 2 more"
 *
 * `photosByCity` maps a city's slug to its number of photos. Returns
 * { label, names }: names is the whole list in that order, for the row's
 * tooltip; label is null when no photo names a city.
 */
export function sessionPlaces(photosByCity) {
  const entries = photosByCity instanceof Map ? [...photosByCity.entries()] : Object.entries(photosByCity || {});
  // Slugs that read the same ("sanjuan", "san juan") count as one city
  const byName = new Map();
  for (const [slug, count] of entries) {
    if (!slug) continue;
    const name = normalizeCityDisplay(slug);
    byName.set(name, (byName.get(name) || 0) + (Number(count) || 0));
  }
  const names = [...byName.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
  if (names.length === 0) return { label: null, names };
  if (names.length === 1) return { label: /\bCity$/.test(names[0]) ? names[0] : `${names[0]} City`, names };
  if (names.length === 2) return { label: `${names[0]} and ${names[1]}`, names };
  if (names.length === 3) return { label: `${names[0]}, ${names[1]} and ${names[2]}`, names };
  return { label: `${names[0]}, ${names[1]} and ${names.length - 2} more`, names };
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
