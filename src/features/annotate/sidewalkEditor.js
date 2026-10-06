import {
  SIDEWALK_MASK_LIMITS,
  clampPoint,
  isSimplePolygon,
  polygonArea,
} from "@/util/validators/sidewalkMask";

/**
 * The sidewalk outline editor (annotator Step 2, 6 Oct 2026) as a reducer, so
 * its logic can be tested without a canvas. sidewalkReducer returns a new state
 * and never mutates the one it is given.
 *
 * Annotators click points around a stretch of walking space and close the
 * shape. Every shape is walking space, and the outline is their union (cut outs
 * were removed on 6 Oct 2026). A finished shape can be selected, and its points
 * dragged, added (from the handle in the middle of an edge) or deleted.
 *
 * Actions that carry a point also carry imageWidth, imageHeight and tolerance
 * (image pixels). Points are clamped to the image and snapped to an image edge
 * within the tolerance, so a sidewalk running off the photo reaches the edge
 * exactly.
 */

export const SIDEWALK_EDITOR_MESSAGES = Object.freeze({
  untickToDraw: "Untick No sidewalk to draw.",
  tooFewPoints: "A shape needs at least three points.",
  crosses: "The outline crosses itself. Move or remove a point.",
  noArea: "The shape has no area. Move or add a point.",
  tooManyPoints: `A shape can have at most ${SIDEWALK_MASK_LIMITS.maxPoints} points.`,
  tooManyShapes: `The outline can have at most ${SIDEWALK_MASK_LIMITS.maxPolygons} shapes.`,
  deletePointTooFew: "A shape needs at least three points. Delete the shape instead.",
  deletePointCrosses: "Removing that point would make the outline cross itself.",
  dragUndone: "That move would make the outline cross itself, so it was undone.",
  deleteShapesFirst: "Delete the shapes first.",
});

const M = SIDEWALK_EDITOR_MESSAGES;

export function initialSidewalkState(mask) {
  const saved = mask != null && typeof mask === "object" && Array.isArray(mask.polygons) ? mask : null;
  return {
    mask: saved
      ? {
          noSidewalk: saved.noSidewalk === true,
          // Walking-space shapes only. A saved mask can hold cut outs only in
          // the development database, from testing before they were removed
          // on 6 Oct 2026. Dropping them lets that outline load and be
          // submitted again, since the server now refuses cut outs.
          polygons: saved.polygons
            .filter((p) => p?.kind === "walk")
            .map((p) => ({ ...p, points: (p.points || []).map((pt) => ({ ...pt })) })),
        }
      : { noSidewalk: false, polygons: [] },
    draft: null,
    preview: null,
    selectedId: null,
    selectedPoint: null,
    drag: null,
    message: null,
  };
}

// ---- Geometry helpers (image pixels) --------------------------------------

const isPositiveFinite = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

/** Moves a point onto an image edge when it is within the tolerance of it. */
export function snapToImageEdge(point, w, h, tolerance = 0) {
  if (!isPositiveFinite(w) || !isPositiveFinite(h)) return { ...point };
  let { x, y } = point;
  if (x <= tolerance) x = 0;
  else if (x >= w - tolerance) x = w;
  if (y <= tolerance) y = 0;
  else if (y >= h - tolerance) y = h;
  return { ...point, x, y };
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Index of the polygon's point nearest to `point` within the tolerance, or null. */
export function findPointNear(polygon, point, tolerance) {
  let best = null;
  let bestDistance = Infinity;
  (polygon?.points || []).forEach((p, index) => {
    const d = distance(p, point);
    if (d <= tolerance && d < bestDistance) {
      best = index;
      bestDistance = d;
    }
  });
  return best;
}

/** The edge whose midpoint handle is within the tolerance: { afterIndex, point }, or null. */
export function findEdgeHandleNear(polygon, point, tolerance) {
  const points = polygon?.points || [];
  let best = null;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const d = distance(mid, point);
    if (d <= tolerance && d < bestDistance) {
      best = { afterIndex: i, point: mid };
      bestDistance = d;
    }
  }
  return best;
}

/** Ray casting. */
export function pointInPolygon(point, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * The smallest polygon containing the point, so a small shape overlapping a
 * large one can still be picked.
 */
export function pickShape(polygons, point) {
  const hits = (polygons || []).filter((p) => pointInPolygon(point, p.points || []));
  if (hits.length === 0) return null;
  hits.sort((a, b) => polygonArea(a.points) - polygonArea(b.points));
  return hits[0];
}

/** True when the point is near enough the draft's first point to close it. */
export function isNearFirstPoint(draft, point, tolerance) {
  const first = draft?.points?.[0];
  return Boolean(first) && distance(first, point) <= tolerance;
}

// ---- Reducer ----------------------------------------------------------------

function placePoint(point, action) {
  const { imageWidth: w, imageHeight: h, tolerance = 0 } = action;
  return snapToImageEdge(clampPoint(point, w, h), w, h, tolerance);
}

/** The next walking-space id: w1, w2... */
function nextId(polygons) {
  const used = polygons
    .filter((p) => typeof p.id === "string" && p.id.startsWith("w"))
    .map((p) => Number(p.id.slice(1)))
    .filter(Number.isFinite);
  return `w${(used.length ? Math.max(...used) : 0) + 1}`;
}

/** Why these points cannot form a shape, or null when they can. */
function shapeProblem(points) {
  if (points.length < 3) return M.tooFewPoints;
  if (!isSimplePolygon(points)) return M.crosses;
  if (!(polygonArea(points) > 0)) return M.noArea;
  return null;
}

const replacePolygon = (state, id, update) => ({
  ...state.mask,
  polygons: state.mask.polygons.map((p) => (p.id === id ? update(p) : p)),
});

export function sidewalkReducer(state, action) {
  const { mask, draft } = state;
  const selected = mask.polygons.find((p) => p.id === state.selectedId) || null;

  switch (action.type) {
    case "START_SHAPE":
      if (mask.noSidewalk) return { ...state, message: M.untickToDraw };
      if (mask.polygons.length >= SIDEWALK_MASK_LIMITS.maxPolygons) return { ...state, message: M.tooManyShapes };
      {
        const point = placePoint(action.point, action);
        return {
          ...state,
          draft: { kind: "walk", points: [point] },
          preview: point,
          selectedId: null,
          selectedPoint: null,
          message: null,
        };
      }

    case "ADD_POINT": {
      if (!draft) return state;
      if (draft.points.length >= SIDEWALK_MASK_LIMITS.maxPoints) return { ...state, message: M.tooManyPoints };
      const point = placePoint(action.point, action);
      const last = draft.points[draft.points.length - 1];
      // A second click on the same spot would make a zero-length edge
      if (last && last.x === point.x && last.y === point.y) return state;
      return { ...state, draft: { ...draft, points: [...draft.points, point] }, preview: point, message: null };
    }

    case "MOVE_PREVIEW":
      if (!draft) return state;
      return { ...state, preview: placePoint(action.point, action) };

    case "CLOSE_SHAPE": {
      if (!draft) return state;
      const problem = shapeProblem(draft.points);
      if (problem) return { ...state, message: problem };
      if (mask.polygons.length >= SIDEWALK_MASK_LIMITS.maxPolygons) return { ...state, message: M.tooManyShapes };
      const id = nextId(mask.polygons);
      return {
        ...state,
        mask: { ...mask, polygons: [...mask.polygons, { id, kind: "walk", points: draft.points }] },
        draft: null,
        preview: null,
        selectedId: id,
        selectedPoint: null,
        message: null,
      };
    }

    case "UNDO_POINT":
      if (!draft) return state;
      if (draft.points.length <= 1) return { ...state, draft: null, preview: null, message: null };
      return { ...state, draft: { ...draft, points: draft.points.slice(0, -1) }, message: null };

    case "CANCEL_SHAPE":
      if (!draft) return state;
      return { ...state, draft: null, preview: null, message: null };

    case "SELECT_SHAPE":
      if (draft || !mask.polygons.some((p) => p.id === action.id)) return state;
      return { ...state, selectedId: action.id, selectedPoint: null, message: null };

    case "SELECT_POINT":
      if (!selected || !Number.isInteger(action.index) || action.index < 0 || action.index >= selected.points.length) {
        return state;
      }
      return { ...state, selectedPoint: action.index, message: null };

    case "CLEAR_SELECTION":
      return { ...state, selectedId: null, selectedPoint: null, message: null };

    case "DELETE_SHAPE":
      if (!selected) return state;
      return {
        ...state,
        mask: { ...mask, polygons: mask.polygons.filter((p) => p.id !== selected.id) },
        selectedId: null,
        selectedPoint: null,
        message: null,
      };

    case "DELETE_POINT": {
      if (!selected || state.selectedPoint == null) return state;
      const points = selected.points.filter((_, i) => i !== state.selectedPoint);
      if (points.length < 3) return { ...state, message: M.deletePointTooFew };
      if (!isSimplePolygon(points) || !(polygonArea(points) > 0)) return { ...state, message: M.deletePointCrosses };
      return {
        ...state,
        mask: replacePolygon(state, selected.id, (p) => ({ ...p, points })),
        selectedPoint: null,
        message: null,
      };
    }

    case "INSERT_POINT": {
      const polygon = mask.polygons.find((p) => p.id === action.id);
      if (draft || !polygon) return state;
      if (polygon.points.length >= SIDEWALK_MASK_LIMITS.maxPoints) return { ...state, message: M.tooManyPoints };
      const index = action.afterIndex + 1;
      const point = placePoint(action.point, action);
      const points = [...polygon.points.slice(0, index), point, ...polygon.points.slice(index)];
      return {
        ...state,
        mask: replacePolygon(state, polygon.id, (p) => ({ ...p, points })),
        selectedId: polygon.id,
        selectedPoint: index,
        message: null,
      };
    }

    case "START_DRAG": {
      const polygon = mask.polygons.find((p) => p.id === action.id);
      if (draft || !polygon || !polygon.points[action.index]) return state;
      return {
        ...state,
        selectedId: polygon.id,
        selectedPoint: action.index,
        drag: { id: polygon.id, index: action.index, before: polygon.points },
        message: null,
      };
    }

    case "DRAG_POINT": {
      if (!state.drag) return state;
      const { id, index } = state.drag;
      const point = placePoint(action.point, action);
      return {
        ...state,
        mask: replacePolygon(state, id, (p) => ({ ...p, points: p.points.map((pt, i) => (i === index ? point : pt)) })),
      };
    }

    case "END_DRAG": {
      if (!state.drag) return state;
      const { id, before } = state.drag;
      const polygon = mask.polygons.find((p) => p.id === id);
      if (polygon && (!isSimplePolygon(polygon.points) || !(polygonArea(polygon.points) > 0))) {
        return {
          ...state,
          mask: replacePolygon(state, id, (p) => ({ ...p, points: before })),
          drag: null,
          message: M.dragUndone,
        };
      }
      return { ...state, drag: null };
    }

    case "SET_NO_SIDEWALK":
      if (action.value === true) {
        if (mask.polygons.length > 0 || draft) return { ...state, message: M.deleteShapesFirst };
        return { ...state, mask: { ...mask, noSidewalk: true }, message: null };
      }
      return { ...state, mask: { ...mask, noSidewalk: false }, message: null };

    default:
      return state;
  }
}
