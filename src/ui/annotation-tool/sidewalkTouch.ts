import { TOUCH_SLOP_PX, type Point } from "./touchGesture";

/**
 * Touch and pen gestures in the annotators' Sidewalk step (12 Oct 2026,
 * IMPRINT_mobile_followup.md section 5.5).
 *
 * A pure reducer in the style of touchGesture.ts, which is for boxes. The tool
 * works out what a press landed on, passes it in with the press, and carries
 * the effect out with the same editor actions the mouse uses, so the editor's
 * own rules (no crossing edges, snapping to the photo's edge, the limits)
 * apply unchanged. Positions are CSS px on the canvas.
 *
 * While a shape is being drawn, a tap adds a point (or closes the shape on its
 * first point) and a drag aims: the preview line and the magnifier follow the
 * finger, and lifting places the point. Otherwise a point of the selected
 * shape is selected by a tap and moved by a drag, a dot in the middle of an
 * edge adds a point, a tap inside a shape selects it, and a tap on empty photo
 * clears the selection, or starts a shape when nothing is selected, so a stray
 * tap never starts one. Any other drag pans. Two fingers zoom.
 */

/** What the press landed on, worked out by the tool at the press. */
export interface SidewalkHit {
  /** A shape is being drawn */
  drafting: boolean;
  /** Drawing with at least 3 points, and the press is on the first point */
  nearFirstPoint: boolean;
  /** A point of the selected shape under the finger (wins over an edge dot) */
  pointIndex: number | null;
  /** The edge of the selected shape whose middle dot is under the finger */
  edgeAfterIndex: number | null;
  /** The smallest shape containing the press */
  shapeId: string | null;
  /** A shape is selected */
  shapeSelected: boolean;
}

export type SidewalkTouchPhase = "idle" | "pending" | "aim" | "dragPoint" | "pan" | "pinch";

export interface SidewalkTouchState {
  phase: SidewalkTouchPhase;
  id: number | null;
  start: Point | null;
  last: Point | null;
  hit: SidewalkHit | null;
  ids: number[];
}

export type SidewalkTouchInput =
  | { type: "down"; id: number; point: Point; hit: SidewalkHit }
  | { type: "move"; id: number; point: Point }
  | { type: "up"; id: number }
  | { type: "cancel"; id: number }
  | { type: "secondDown"; id: number; point: Point };

export type SidewalkTouchEffect =
  | { type: "none" }
  | { type: "close" }
  | { type: "addPoint"; point: Point }
  | { type: "aim"; point: Point }
  | { type: "place"; point: Point }
  | { type: "cancelAim" }
  | { type: "selectPoint"; index: number }
  | { type: "startDrag"; index: number; point: Point }
  | { type: "dragPoint"; point: Point }
  | { type: "endDrag" }
  | { type: "insertPoint"; afterIndex: number; drag: boolean; point: Point }
  | { type: "selectShape"; shapeId: string }
  | { type: "clearSelection" }
  | { type: "startShape"; point: Point }
  | { type: "pan"; dx: number; dy: number }
  | { type: "revertDrag" };

export const initialSidewalkTouchState = (): SidewalkTouchState => ({
  phase: "idle",
  id: null,
  start: null,
  last: null,
  hit: null,
  ids: [],
});

const NONE: SidewalkTouchEffect = { type: "none" };

const pastSlop = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y) > TOUCH_SLOP_PX;

/** What a gesture cut short leaves behind: a dragged point goes back, an aim adds nothing. */
function undo(phase: SidewalkTouchPhase): SidewalkTouchEffect {
  if (phase === "dragPoint") return { type: "revertDrag" };
  if (phase === "aim") return { type: "cancelAim" };
  return NONE;
}

/** The next state and the effect for the tool to carry out. Never mutates the state. */
export function reduceSidewalkTouch(state: SidewalkTouchState, event: SidewalkTouchInput): { state: SidewalkTouchState; effect: SidewalkTouchEffect } {
  switch (event.type) {
    case "down":
      return {
        state: { phase: "pending", id: event.id, start: event.point, last: event.point, hit: event.hit, ids: [event.id] },
        effect: NONE,
      };

    case "secondDown": {
      const ids = state.ids.includes(event.id) ? state.ids : [...state.ids, event.id];
      if (state.phase === "pinch") return { state: { ...state, ids }, effect: NONE };
      return { state: { ...state, phase: "pinch", ids }, effect: undo(state.phase) };
    }

    case "move": {
      if (state.phase === "idle" || state.phase === "pinch" || event.id !== state.id || !state.start || !state.hit) {
        return { state, effect: NONE };
      }
      const { start, hit } = state;
      const point = event.point;
      if (state.phase === "pending") {
        if (!pastSlop(start, point)) return { state, effect: NONE };
        // While drawing, a drag aims the next point. Panning takes two fingers.
        if (hit.drafting) return { state: { ...state, phase: "aim", last: point }, effect: { type: "aim", point } };
        if (hit.pointIndex !== null) {
          return { state: { ...state, phase: "dragPoint", last: point }, effect: { type: "startDrag", index: hit.pointIndex, point } };
        }
        if (hit.edgeAfterIndex !== null) {
          return {
            state: { ...state, phase: "dragPoint", last: point },
            effect: { type: "insertPoint", afterIndex: hit.edgeAfterIndex, drag: true, point },
          };
        }
        return { state: { ...state, phase: "pan", last: point }, effect: { type: "pan", dx: point.x - start.x, dy: point.y - start.y } };
      }
      if (state.phase === "aim") return { state: { ...state, last: point }, effect: { type: "aim", point } };
      if (state.phase === "dragPoint") return { state: { ...state, last: point }, effect: { type: "dragPoint", point } };
      const last = state.last ?? start;
      return { state: { ...state, last: point }, effect: { type: "pan", dx: point.x - last.x, dy: point.y - last.y } };
    }

    case "up": {
      if (state.phase === "pinch") {
        const ids = state.ids.filter((id) => id !== event.id);
        return { state: ids.length === 0 ? initialSidewalkTouchState() : { ...state, ids }, effect: NONE };
      }
      if (state.phase === "idle" || event.id !== state.id || !state.hit || !state.start) return { state, effect: NONE };
      const { hit, start } = state;
      let effect: SidewalkTouchEffect = NONE;
      if (state.phase === "pending") {
        // A tap
        if (hit.drafting) effect = hit.nearFirstPoint ? { type: "close" } : { type: "addPoint", point: start };
        else if (hit.pointIndex !== null) effect = { type: "selectPoint", index: hit.pointIndex };
        else if (hit.edgeAfterIndex !== null) effect = { type: "insertPoint", afterIndex: hit.edgeAfterIndex, drag: false, point: start };
        else if (hit.shapeId !== null) effect = { type: "selectShape", shapeId: hit.shapeId };
        else if (hit.shapeSelected) effect = { type: "clearSelection" };
        else effect = { type: "startShape", point: start };
      } else if (state.phase === "aim") {
        effect = { type: "place", point: state.last ?? start };
      } else if (state.phase === "dragPoint") {
        effect = { type: "endDrag" };
      }
      return { state: initialSidewalkTouchState(), effect };
    }

    case "cancel":
      if (state.phase === "idle") return { state, effect: NONE };
      return { state: initialSidewalkTouchState(), effect: undo(state.phase) };

    default:
      return { state, effect: NONE };
  }
}
