/**
 * Touch and pen gestures on the photo (contributors, 9 Oct 2026,
 * IMPRINT_contributor_mobile.md section 2.2).
 *
 * A pure reducer in the style of features/annotate/sidewalkEditor.js: no DOM
 * and no canvas. The tool works out what a press landed on (a corner handle of
 * the selected box, the inside of the selected box, another box, or empty
 * photo), passes that in with the press, and carries out the effect that comes
 * back. Positions are CSS px relative to the photo area, which is what the
 * slop is measured in.
 *
 * The mouse never comes here. It keeps its own handlers and state classes.
 */

/** Under this many CSS px a gesture is a tap, past it a drag. */
export const TOUCH_SLOP_PX = 8;

export type Point = { x: number; y: number };
export type Corner = 0 | 1 | 2 | 3;

/** What the press landed on, worked out by the tool at the press. */
export interface TouchHit {
  /** A corner handle of the selected box, top-left, top-right, bottom-right, bottom-left */
  corner: Corner | null;
  /** Inside the selected box, not on a corner */
  insideSelected: boolean;
  /** The box a tap here would select, null for none or the selected box itself */
  boxId: string | null;
}

export type TouchPhase = "idle" | "pending" | "corner" | "moveBox" | "pan" | "pinch";

export interface TouchState {
  phase: TouchPhase;
  /** The finger the one-finger gesture follows */
  id: number | null;
  start: Point | null;
  last: Point | null;
  hit: TouchHit | null;
  /** Every finger down, so a pinch ends when the last one lifts */
  ids: number[];
}

export type TouchInput =
  | { type: "down"; id: number; point: Point; hit: TouchHit }
  | { type: "move"; id: number; point: Point }
  | { type: "up"; id: number }
  | { type: "cancel"; id: number }
  | { type: "secondDown"; id: number; point: Point };

export type TouchEffect =
  | { type: "none" }
  | { type: "select"; boxId: string }
  | { type: "deselect" }
  | { type: "startCorner"; corner: Corner; point: Point }
  | { type: "moveCorner"; point: Point }
  | { type: "startMove"; dx: number; dy: number }
  | { type: "moveBox"; dx: number; dy: number }
  | { type: "pan"; dx: number; dy: number }
  | { type: "revert" }
  | { type: "commit" };

export const initialTouchState = (): TouchState => ({
  phase: "idle",
  id: null,
  start: null,
  last: null,
  hit: null,
  ids: [],
});

const NONE: TouchEffect = { type: "none" };

const pastSlop = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y) > TOUCH_SLOP_PX;

/** The next state and the effect for the tool to carry out. Never mutates the state. */
export function reduceTouch(state: TouchState, event: TouchInput): { state: TouchState; effect: TouchEffect } {
  switch (event.type) {
    case "down":
      return {
        state: { phase: "pending", id: event.id, start: event.point, last: event.point, hit: event.hit, ids: [event.id] },
        effect: NONE,
      };

    case "secondDown": {
      // A second finger: whatever the first was doing is put back, and the
      // two fingers zoom. A pinch never edits a box.
      const ids = state.ids.includes(event.id) ? state.ids : [...state.ids, event.id];
      if (state.phase === "pinch") return { state: { ...state, ids }, effect: NONE };
      return { state: { ...state, phase: "pinch", ids }, effect: { type: "revert" } };
    }

    case "move": {
      if (state.phase === "idle" || state.phase === "pinch" || event.id !== state.id || !state.start || !state.hit) {
        return { state, effect: NONE };
      }
      const { start, hit } = state;
      const point = event.point;
      if (state.phase === "pending") {
        if (!pastSlop(start, point)) return { state, effect: NONE };
        // Past the slop: a corner wins over everything, then the inside of the
        // selected box. A drag that starts on another box, or on empty photo,
        // pans: a box is never moved by the drag that would select it.
        if (hit.corner !== null) {
          return { state: { ...state, phase: "corner", last: point }, effect: { type: "startCorner", corner: hit.corner, point } };
        }
        if (hit.insideSelected) {
          return {
            state: { ...state, phase: "moveBox", last: point },
            effect: { type: "startMove", dx: point.x - start.x, dy: point.y - start.y },
          };
        }
        return {
          state: { ...state, phase: "pan", last: point },
          effect: { type: "pan", dx: point.x - start.x, dy: point.y - start.y },
        };
      }
      if (state.phase === "corner") {
        return { state: { ...state, last: point }, effect: { type: "moveCorner", point } };
      }
      if (state.phase === "moveBox") {
        return { state: { ...state, last: point }, effect: { type: "moveBox", dx: point.x - start.x, dy: point.y - start.y } };
      }
      // pan: by how far the finger moved since the last move
      const last = state.last ?? start;
      return { state: { ...state, last: point }, effect: { type: "pan", dx: point.x - last.x, dy: point.y - last.y } };
    }

    case "up": {
      if (state.phase === "pinch") {
        const ids = state.ids.filter((id) => id !== event.id);
        return { state: ids.length === 0 ? initialTouchState() : { ...state, ids }, effect: NONE };
      }
      if (state.phase === "idle" || event.id !== state.id) return { state, effect: NONE };
      let effect: TouchEffect = NONE;
      if (state.phase === "pending" && state.hit) {
        // A tap
        if (state.hit.boxId) effect = { type: "select", boxId: state.hit.boxId };
        else if (!state.hit.insideSelected && state.hit.corner === null) effect = { type: "deselect" };
      } else if (state.phase === "corner" || state.phase === "moveBox") {
        effect = { type: "commit" };
      }
      return { state: initialTouchState(), effect };
    }

    case "cancel":
      // The browser took the gesture over, or the finger left the screen
      if (state.phase === "idle") return { state, effect: NONE };
      return { state: initialTouchState(), effect: { type: "revert" } };

    default:
      return { state, effect: NONE };
  }
}
