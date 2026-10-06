/**
 * The annotator's sidewalk outline (Step 2, decided 6 Oct 2026), shared by the
 * annotation tool and the submit route. No DOM.
 *
 * The outline is a set of simple polygons in the display copy's pixels, the
 * same space as the box marks and Image.width and Image.height:
 *
 *   { noSidewalk: false, polygons: [{ id: "w1", kind: "walk", points: [{ x, y }, ...] }, ...] }
 *
 * An outline is one or more walking-space polygons (kind "walk"), and the mask
 * it describes is their union. Cut outs were removed on 6 Oct 2026: they
 * invited cutting around objects standing on the sidewalk, which the outline
 * must run under. An image with no sidewalk or pedestrian path records
 * { noSidewalk: true, polygons: [] }, an empty mask kept as a negative example
 * (chapter_4.tex line 64). The pixel masks are drawn from these polygons
 * outside IMPRINT. Model-development images get an outline, and so do the 30
 * reference images flagged sidewalkAgreement: true, for agreement between
 * annotators only (6 Oct 2026).
 */

export const SIDEWALK_MASK_LIMITS = Object.freeze({ maxPolygons: 30, maxPoints: 300 });

const MESSAGES = Object.freeze({
  missing: "Sidewalk outline is missing.",
  noSidewalkWithShapes: "Remove the sidewalk shapes or untick No sidewalk.",
  noWalk: "Outline the sidewalk, or tick No sidewalk if there is none.",
  tooMany: "The sidewalk outline has too many shapes or points.",
  invalidShape:
    "A sidewalk shape is not a valid outline. Each shape needs at least three points and its edges must not cross.",
});

/**
 * Model-development images get an outline, for training and evaluation.
 * Reference images get none, except the 30 marked sidewalkAgreement: true
 * (6 Oct 2026), whose outlines measure agreement between annotators and are
 * never used to train, tune or test a model (chapter_4.tex line 116). Only the
 * literal true counts. The flag is set by the thesis scripts
 * (apply_sidewalk_reference.mjs), not by IMPRINT.
 */
export function requiresSidewalkMask(image) {
  if (!image) return false;
  if (image.isReference === true) return image.sidewalkAgreement === true;
  return image.poolStatus === "model_dev";
}

const isPositiveFinite = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
const isFiniteNumber = (n) => typeof n === "number" && Number.isFinite(n);
const isPoint = (p) => p != null && typeof p === "object" && isFiniteNumber(p.x) && isFiniteNumber(p.y);
const samePoint = (a, b) => a.x === b.x && a.y === b.y;

/** Shoelace area, absolute value. */
export function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

function orientation(p, q, r) {
  const v = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (v === 0) return 0;
  return v > 0 ? 1 : 2;
}

function onSegment(p, q, r) {
  return (
    Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) &&
    Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y)
  );
}

/** True when segments ab and cd intersect, touching included. */
export function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return false;
}

/**
 * At least 3 points, no zero-length edge, and no two non-adjacent edges
 * intersecting (touching included). O(n²), fine at 300 points.
 */
export function isSimplePolygon(points) {
  if (!Array.isArray(points) || points.length < 3 || !points.every(isPoint)) return false;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    if (samePoint(points[i], points[(i + 1) % n])) return false;
  }
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Adjacent edges share a vertex, so they always touch
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(a, b, points[j], points[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** Clamps a point to the image. Returns a copy unchanged when the size is unknown. */
export function clampPoint(p, w, h) {
  if (!isPositiveFinite(w) || !isPositiveFinite(h)) return { ...p };
  return { ...p, x: Math.min(Math.max(p.x, 0), w), y: Math.min(Math.max(p.y, 0), h) };
}

/** Rounds to 2 decimals, like box marks. */
export function roundPoint(p) {
  return { ...p, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
}

function normalizePoints(points, w, h) {
  if (!Array.isArray(points)) return points;
  const out = [];
  for (const p of points) {
    // Anything that is not a numeric point is left for validation to refuse
    const next = isPoint(p) ? roundPoint(clampPoint(p, w, h)) : p;
    const prev = out[out.length - 1];
    if (isPoint(next) && prev && isPoint(prev) && samePoint(prev, next)) continue;
    out.push(next);
  }
  // A last point equal to the first is a consecutive duplicate too, once the ring closes
  if (out.length > 1 && isPoint(out[0]) && isPoint(out[out.length - 1]) && samePoint(out[0], out[out.length - 1])) {
    out.pop();
  }
  return out;
}

/**
 * A copy with every point clamped to the image (when its size is known) and
 * rounded, and consecutive duplicate points removed. null stays null, and a
 * value that is not a mask object is returned as it is for validation to
 * refuse. Does not mutate.
 */
export function normalizeSidewalkMask(mask, w, h) {
  if (mask === null) return null;
  if (mask == null || typeof mask !== "object" || Array.isArray(mask)) return mask;
  if (!Array.isArray(mask.polygons)) return { ...mask };
  return {
    ...mask,
    polygons: mask.polygons.map((polygon) =>
      polygon != null && typeof polygon === "object"
        ? { ...polygon, points: normalizePoints(polygon.points, w, h) }
        : polygon
    ),
  };
}

function isValidPolygon(polygon, w, h) {
  if (polygon == null || typeof polygon !== "object") return false;
  if (typeof polygon.id !== "string" || polygon.id === "") return false;
  // Walking space only. A "cutout" can only come from a page loaded before
  // 6 Oct 2026, when cut outs were removed.
  if (polygon.kind !== "walk") return false;
  const { points } = polygon;
  if (!Array.isArray(points) || points.length < 3 || !points.every(isPoint)) return false;
  if (isPositiveFinite(w) && isPositiveFinite(h)) {
    if (points.some((p) => p.x < 0 || p.x > w || p.y < 0 || p.y > h)) return false;
  }
  return isSimplePolygon(points) && polygonArea(points) > 0;
}

/** { valid, message }. Bounds are checked only when the image size is known. */
export function validateSidewalkMask(mask, w, h) {
  if (mask == null || typeof mask !== "object" || typeof mask.noSidewalk !== "boolean" || !Array.isArray(mask.polygons)) {
    return { valid: false, message: MESSAGES.missing };
  }
  const { noSidewalk, polygons } = mask;
  if (noSidewalk) {
    return polygons.length > 0 ? { valid: false, message: MESSAGES.noSidewalkWithShapes } : { valid: true };
  }
  if (!polygons.some((p) => p?.kind === "walk")) {
    return { valid: false, message: MESSAGES.noWalk };
  }
  if (polygons.length > SIDEWALK_MASK_LIMITS.maxPolygons) {
    return { valid: false, message: MESSAGES.tooMany };
  }
  if (polygons.some((p) => Array.isArray(p?.points) && p.points.length > SIDEWALK_MASK_LIMITS.maxPoints)) {
    return { valid: false, message: MESSAGES.tooMany };
  }
  const ids = new Set();
  for (const polygon of polygons) {
    if (!isValidPolygon(polygon, w, h) || ids.has(polygon.id)) {
      return { valid: false, message: MESSAGES.invalidShape };
    }
    ids.add(polygon.id);
  }
  return { valid: true };
}

/** Counts for telemetry. All 0 and noSidewalk null when there is no mask. */
export function summarizeSidewalkMask(mask) {
  if (mask == null || typeof mask !== "object" || !Array.isArray(mask.polygons)) {
    return { noSidewalk: null, walkCount: 0, pointCount: 0 };
  }
  const { polygons } = mask;
  return {
    noSidewalk: typeof mask.noSidewalk === "boolean" ? mask.noSidewalk : null,
    walkCount: polygons.filter((p) => p?.kind === "walk").length,
    pointCount: polygons.reduce((n, p) => n + (Array.isArray(p?.points) ? p.points.length : 0), 0),
  };
}
