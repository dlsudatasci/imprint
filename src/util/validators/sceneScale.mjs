/**
 * Which way Step 2's numbered answers run (22 Oct 2026).
 *
 * Until 22 Oct 2026 the first answer was the best one and was stored as 1:
 * Accessible to Me ran 1 Easily accessible to 5 Not accessible, Surface
 * Condition 1 Easy to traverse to 3 Difficult or dangerous, Walking Comfort 1
 * Comfortable to 3 Uncomfortable. Read as a score, "1" for the best answer
 * said the opposite of what it meant. From then the scale runs the other way,
 * higher is better, and the answers are shown worst to best:
 *
 *   overallAccessibility  1 Not accessible ... 5 Easily accessible
 *   surfaceCondition      1 Difficult or dangerous, 2 Some difficulty, 3 Easy to traverse
 *   walkability           1 Uncomfortable, 2 Somewhat uncomfortable, 3 Comfortable
 *
 * Sidewalk width is stored as words and does not change; only its answers'
 * order on screen does (None, Narrow, Moderate, Wide).
 *
 * An annotation answered on the new scale carries sceneScale: 2, sent by the
 * tool with each submit like canvasVersion, so a page loaded before the change
 * (old scale, no sceneScale) is never mistaken for one after it. A sceneLevel
 * without it is on the old scale. Everything that reads the answers reads them
 * through toCurrentScale, so old and new rows agree. The database is a
 * testing one, so old rows are left as they are rather than rewritten.
 */
export const SCENE_SCALE = 2;

/** The top of each numbered answer's scale. */
export const SCENE_SCALE_TOP = Object.freeze({ surfaceCondition: 3, walkability: 3, overallAccessibility: 5 });

/** An old-scale answer on the new scale. Anything that is not one of the scale's whole numbers is left as it is. */
export function flipAnswer(value, top) {
  if (value === null || value === undefined || typeof value === "boolean") return value;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > top) return value;
  return top + 1 - n;
}

/**
 * The answers on the new scale. `scale` is the row's sceneScale: SCENE_SCALE
 * returns the answers as they are, anything else flips the numbered ones.
 * Null for no answers (annotators, who answer no scene questions). Only the
 * three numbered answers change; any other field is kept.
 */
export function toCurrentScale(sceneLevel, scale) {
  if (!sceneLevel || typeof sceneLevel !== "object") return null;
  if (scale === SCENE_SCALE) return sceneLevel;
  const out = { ...sceneLevel };
  for (const [key, top] of Object.entries(SCENE_SCALE_TOP)) {
    if (key in out) out[key] = flipAnswer(out[key], top);
  }
  return out;
}

/** An annotation's (or reference entry's) answers on the new scale */
export function sceneAnswersOf(record) {
  return record ? toCurrentScale(record.sceneLevel, record.sceneScale) : null;
}

/**
 * A MongoDB expression for a numbered answer on the new scale, for
 * aggregations over annotations ($avg skips the nulls it gives for a missing
 * answer).
 */
export function currentScaleExpr(key) {
  const top = SCENE_SCALE_TOP[key];
  if (!top) throw new Error(`Not a numbered scene answer: ${key}`);
  const field = `$sceneLevel.${key}`;
  return {
    $cond: [
      { $eq: ["$sceneScale", SCENE_SCALE] },
      field,
      { $cond: [{ $isNumber: field }, { $subtract: [top + 1, field] }, null] },
    ],
  };
}

