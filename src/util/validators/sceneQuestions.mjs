/**
 * Step 3's question set (S15, Nov 2026), the one place its rules live, read by
 * the tool, both validators, the trays' progress line, the practice image and
 * the readers.
 *
 * Question set 2, in the order shown: Sidewalk Width (as built), Ease of
 * Navigation (stored as overallAccessibility, the field Accessible to Me used),
 * Evenness (surfaceEvenness), Surface Type (surfaceType), Surface Condition
 * (surfaceCondition) and Road Barrier (roadBarrier, true or false). Whether
 * there is a sidewalk is now Step 1 (9 Nov 2026): Sidewalk or Only a path, so
 * Sidewalk Width no longer offers None. For a sidewalk all six are asked. For
 * a path only Ease of Navigation and Evenness are, and the four that need a
 * built sidewalk (SIDEWALK_ONLY_KEYS) stay null.
 *
 * Before S15 the questions were Sidewalk Width with None, Surface Condition,
 * Walking Comfort (walkability) and Accessible to Me. No contributor answers
 * were recorded on them on production (Rans, 9 Nov 2026), so nothing reads both sets.
 * surfaceCondition keeps its name with redefined answers (Broken, Cracked,
 * Intact), and overallAccessibility its scale with new labels.
 *
 * Every numbered answer runs worst to best and is stored higher is better
 * (sceneScale 2, validators/sceneScale.mjs). surfaceEvenness was never on the
 * old scale, so it is not in SCENE_SCALE_TOP and is never turned round.
 * surfaceType is a category and roadBarrier a yes or no, so neither has a scale.
 */
/**
 * Stored values for Sidewalk Width, worst to best: Narrow, Limited, Wide.
 * The names are set 1's and are kept so stored rows stay comparable. Set 1's
 * no_sidewalk is not a set 2 answer.
 */
export const SIDEWALK_WIDTH_OPTIONS = Object.freeze(["one_person", "two_people", "three_or_more"]);

/** The numbered answers of set 2 and the top of each scale */
export const SCENE_NUMBERED = Object.freeze({ overallAccessibility: 5, surfaceEvenness: 3, surfaceCondition: 3 });

/** Stored values for Surface Type, which has no order */
export const SURFACE_TYPE_OPTIONS = Object.freeze(["concrete", "tiles", "pavers", "unpaved"]);

/** The answers a set 2 sceneLevel holds, and nothing else */
export const SCENE_KEYS = Object.freeze(["sidewalkWidth", "overallAccessibility", "surfaceEvenness", "surfaceType", "surfaceCondition", "roadBarrier"]);

export function emptySceneLevel() {
  return { sidewalkWidth: null, overallAccessibility: null, surfaceEvenness: null, surfaceType: null, surfaceCondition: null, roadBarrier: null };
}

const given = (v) => v !== null && v !== undefined;

/** The questions asked only when Step 1 says there is a sidewalk, not a path */
export const SIDEWALK_ONLY_KEYS = Object.freeze(["sidewalkWidth", "surfaceType", "surfaceCondition", "roadBarrier"]);

/** The questions a sceneLevel must answer, in the order shown: all six, or two for a path */
export function requiredSceneKeys(hasSidewalk = true) {
  return SCENE_KEYS.filter((k) => hasSidewalk !== false || !SIDEWALK_ONLY_KEYS.includes(k));
}

/** How much of Step 3 is answered, for the line at the top of the phone's answers sheet */
export function sceneProgress(scene, hasSidewalk = true) {
  const s = scene || {};
  const keys = requiredSceneKeys(hasSidewalk);
  return { answered: keys.filter((k) => given(s[k])).length, required: keys.length };
}
