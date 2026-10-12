import { describe, it, expect } from "vitest";
import { reduceTouch, initialTouchState, TOUCH_SLOP_PX, type TouchHit, type TouchInput, type TouchState } from "./touchGesture";

/**
 * Touch and pen gestures on the photo (9 Oct 2026): a tap selects or
 * deselects, a drag past the slop fits a corner, moves the selected box or
 * pans, and a second finger or a cancel puts the box back.
 */
const hit = (over: Partial<TouchHit> = {}): TouchHit => ({ corner: null, insideSelected: false, boxId: null, ...over });

function run(events: TouchInput[], state: TouchState = initialTouchState()) {
  const effects = [];
  for (const event of events) {
    const next = reduceTouch(state, event);
    effects.push(next.effect);
    state = next.state;
  }
  return { state, effects };
}

const down = (h: TouchHit, x = 100, y = 100): TouchInput => ({ type: "down", id: 1, point: { x, y }, hit: h });
const move = (x: number, y: number, id = 1): TouchInput => ({ type: "move", id, point: { x, y } });
const up = (id = 1): TouchInput => ({ type: "up", id });

describe("reduceTouch", () => {
  it("selects a box on a tap without moving anything", () => {
    const { effects, state } = run([down(hit({ boxId: "car" })), up()]);
    expect(effects).toEqual([{ type: "none" }, { type: "select", boxId: "car" }]);
    expect(state.phase).toBe("idle");
  });

  it("still counts a move under the slop as a tap", () => {
    const { effects } = run([down(hit({ boxId: "car" })), move(100 + TOUCH_SLOP_PX - 1, 100), up()]);
    expect(effects.map((e) => e.type)).toEqual(["none", "none", "select"]);
  });

  it("pans on a drag that starts on an unselected box, and never moves it", () => {
    const { effects } = run([down(hit({ boxId: "car" })), move(130, 100), move(150, 110), up()]);
    expect(effects).toEqual([
      { type: "none" },
      { type: "pan", dx: 30, dy: 0 },
      { type: "pan", dx: 20, dy: 10 },
      { type: "none" },
    ]);
  });

  it("moves the selected box only past the slop, by the distance from the press, and commits on lift", () => {
    const { effects } = run([down(hit({ insideSelected: true })), move(105, 100), move(120, 90), move(140, 80), up()]);
    expect(effects).toEqual([
      { type: "none" },
      { type: "none" },
      { type: "startMove", dx: 20, dy: -10 },
      { type: "moveBox", dx: 40, dy: -20 },
      { type: "commit" },
    ]);
  });

  it("lets a corner press win over the inside of a small box", () => {
    const { effects, state } = run([down(hit({ corner: 2, insideSelected: true, boxId: "pole" })), move(120, 120)]);
    expect(effects[1]).toEqual({ type: "startCorner", corner: 2, point: { x: 120, y: 120 } });
    expect(state.phase).toBe("corner");
    const next = run([move(130, 140), up()], state);
    expect(next.effects).toEqual([{ type: "moveCorner", point: { x: 130, y: 140 } }, { type: "commit" }]);
  });

  it("pans on a drag over empty photo, and deselects on a tap there", () => {
    expect(run([down(hit()), move(80, 60)]).effects[1]).toEqual({ type: "pan", dx: -20, dy: -40 });
    expect(run([down(hit()), up()]).effects[1]).toEqual({ type: "deselect" });
  });

  it("does nothing on a tap inside the selected box or on its corner", () => {
    expect(run([down(hit({ insideSelected: true })), up()]).effects[1]).toEqual({ type: "none" });
    expect(run([down(hit({ corner: 0 })), up()]).effects[1]).toEqual({ type: "none" });
  });

  it("puts the box back and starts a pinch on a second finger, and the pinch edits nothing", () => {
    const started = run([down(hit({ corner: 1 })), move(130, 100), move(140, 100)]);
    expect(started.state.phase).toBe("corner");
    const pinch = run([{ type: "secondDown", id: 2, point: { x: 300, y: 300 } }, move(200, 200), move(310, 310, 2)], started.state);
    expect(pinch.effects).toEqual([{ type: "revert" }, { type: "none" }, { type: "none" }]);
    expect(pinch.state.phase).toBe("pinch");
    // The pinch ends when both fingers lift, with no commit
    const lifted = run([up(1), up(2)], pinch.state);
    expect(lifted.effects).toEqual([{ type: "none" }, { type: "none" }]);
    expect(lifted.state.phase).toBe("idle");
  });

  it("puts the box back on a cancel", () => {
    const { state } = run([down(hit({ insideSelected: true })), move(140, 100)]);
    const cancelled = reduceTouch(state, { type: "cancel", id: 1 });
    expect(cancelled.effect).toEqual({ type: "revert" });
    expect(cancelled.state.phase).toBe("idle");
  });

  it("ignores another finger's moves and lifts outside a pinch", () => {
    const { effects } = run([down(hit({ insideSelected: true })), move(140, 100, 7), up(7)]);
    expect(effects.map((e) => e.type)).toEqual(["none", "none", "none"]);
  });

  it("never mutates the state it is given", () => {
    const state = Object.freeze(initialTouchState());
    expect(() => reduceTouch(state, down(hit()))).not.toThrow();
  });
});
