import { describe, it, expect } from "vitest";
import {
  reduceSidewalkTouch,
  initialSidewalkTouchState,
  type SidewalkHit,
  type SidewalkTouchInput,
  type SidewalkTouchState,
} from "./sidewalkTouch";

/** Touch in the annotators' Sidewalk step (12 Oct 2026). */
const hit = (over: Partial<SidewalkHit> = {}): SidewalkHit => ({
  drafting: false,
  nearFirstPoint: false,
  pointIndex: null,
  edgeAfterIndex: null,
  shapeId: null,
  shapeSelected: false,
  ...over,
});

function run(events: SidewalkTouchInput[], state: SidewalkTouchState = initialSidewalkTouchState()) {
  const effects = [];
  for (const event of events) {
    const next = reduceSidewalkTouch(state, event);
    effects.push(next.effect);
    state = next.state;
  }
  return { state, effects };
}

const down = (h: SidewalkHit, x = 100, y = 100): SidewalkTouchInput => ({ type: "down", id: 1, point: { x, y }, hit: h });
const move = (x: number, y: number, id = 1): SidewalkTouchInput => ({ type: "move", id, point: { x, y } });
const up = (id = 1): SidewalkTouchInput => ({ type: "up", id });
const second: SidewalkTouchInput = { type: "secondDown", id: 2, point: { x: 300, y: 300 } };

describe("reduceSidewalkTouch while a shape is being drawn", () => {
  const drawing = hit({ drafting: true });

  it("adds a point where the finger went down on a tap", () => {
    expect(run([down(drawing, 120, 140), move(123, 142), up()]).effects.at(-1)).toEqual({ type: "addPoint", point: { x: 120, y: 140 } });
  });

  it("closes the shape on a tap on its first point", () => {
    expect(run([down(hit({ drafting: true, nearFirstPoint: true })), up()]).effects.at(-1)).toEqual({ type: "close" });
  });

  it("aims on a drag, and places the point where the finger lifts", () => {
    const { effects, state } = run([down(drawing), move(104, 100), move(130, 110), move(150, 125), up()]);
    expect(effects).toEqual([
      { type: "none" },
      { type: "none" },
      { type: "aim", point: { x: 130, y: 110 } },
      { type: "aim", point: { x: 150, y: 125 } },
      { type: "place", point: { x: 150, y: 125 } },
    ]);
    expect(state.phase).toBe("idle");
  });

  it("never pans with one finger while drawing, even from inside a shape", () => {
    const { effects } = run([down(hit({ drafting: true, shapeId: "w1" })), move(160, 100)]);
    expect(effects[1].type).toBe("aim");
  });
});

describe("reduceSidewalkTouch with no shape being drawn", () => {
  it("selects a point on a tap, and drags it past the slop, ending the drag on lift", () => {
    const onPoint = hit({ pointIndex: 2, shapeSelected: true, shapeId: "w1" });
    expect(run([down(onPoint), up()]).effects.at(-1)).toEqual({ type: "selectPoint", index: 2 });
    const { effects } = run([down(onPoint), move(120, 100), move(140, 110), up()]);
    expect(effects).toEqual([
      { type: "none" },
      { type: "startDrag", index: 2, point: { x: 120, y: 100 } },
      { type: "dragPoint", point: { x: 140, y: 110 } },
      { type: "endDrag" },
    ]);
  });

  it("lets a point win over the dot in the middle of an edge", () => {
    expect(run([down(hit({ pointIndex: 0, edgeAfterIndex: 3, shapeSelected: true })), up()]).effects.at(-1)).toEqual({ type: "selectPoint", index: 0 });
  });

  it("adds a point on an edge on a tap, and adds then drags it on a drag", () => {
    const onEdge = hit({ edgeAfterIndex: 1, shapeSelected: true, shapeId: "w1" });
    expect(run([down(onEdge, 200, 150), up()]).effects.at(-1)).toEqual({ type: "insertPoint", afterIndex: 1, drag: false, point: { x: 200, y: 150 } });
    const { effects } = run([down(onEdge, 200, 150), move(220, 150), move(240, 160), up()]);
    expect(effects).toEqual([
      { type: "none" },
      { type: "insertPoint", afterIndex: 1, drag: true, point: { x: 220, y: 150 } },
      { type: "dragPoint", point: { x: 240, y: 160 } },
      { type: "endDrag" },
    ]);
  });

  it("selects a shape on a tap inside it, and pans on a drag there", () => {
    expect(run([down(hit({ shapeId: "w2" })), up()]).effects.at(-1)).toEqual({ type: "selectShape", shapeId: "w2" });
    expect(run([down(hit({ shapeId: "w2" })), move(130, 100), move(150, 90)]).effects.slice(1)).toEqual([
      { type: "pan", dx: 30, dy: 0 },
      { type: "pan", dx: 20, dy: -10 },
    ]);
  });

  it("clears the selection on a tap on empty photo before it starts a shape", () => {
    expect(run([down(hit({ shapeSelected: true }), 50, 60), up()]).effects.at(-1)).toEqual({ type: "clearSelection" });
    expect(run([down(hit(), 50, 60), up()]).effects.at(-1)).toEqual({ type: "startShape", point: { x: 50, y: 60 } });
  });

  it("pans on a drag on empty photo, and starts no shape", () => {
    const { effects } = run([down(hit()), move(100, 140), up()]);
    expect(effects).toEqual([{ type: "none" }, { type: "pan", dx: 0, dy: 40 }, { type: "none" }]);
  });
});

describe("reduceSidewalkTouch cut short", () => {
  it("puts a dragged point back on a second finger, then pinches without editing", () => {
    const dragging = run([down(hit({ pointIndex: 1, shapeSelected: true })), move(130, 100)]);
    const pinch = run([second, move(200, 200), move(310, 310, 2), up(1), up(2)], dragging.state);
    expect(pinch.effects).toEqual([{ type: "revertDrag" }, { type: "none" }, { type: "none" }, { type: "none" }, { type: "none" }]);
    expect(pinch.state.phase).toBe("idle");
  });

  it("adds nothing when an aim is cut short by a second finger", () => {
    const aiming = run([down(hit({ drafting: true })), move(140, 100)]);
    const next = reduceSidewalkTouch(aiming.state, second);
    expect(next.effect).toEqual({ type: "cancelAim" });
    expect(next.state.phase).toBe("pinch");
  });

  it("puts a dragged point back, and cancels an aim, on a cancel", () => {
    const dragging = run([down(hit({ pointIndex: 1, shapeSelected: true })), move(130, 100)]);
    expect(reduceSidewalkTouch(dragging.state, { type: "cancel", id: 1 })).toMatchObject({ effect: { type: "revertDrag" }, state: { phase: "idle" } });
    const aiming = run([down(hit({ drafting: true })), move(140, 100)]);
    expect(reduceSidewalkTouch(aiming.state, { type: "cancel", id: 1 })).toMatchObject({ effect: { type: "cancelAim" }, state: { phase: "idle" } });
  });

  it("does nothing for a second finger or a cancel on a press that has not moved", () => {
    const pressed = run([down(hit())]);
    expect(reduceSidewalkTouch(pressed.state, second).effect).toEqual({ type: "none" });
    expect(reduceSidewalkTouch(pressed.state, { type: "cancel", id: 1 }).effect).toEqual({ type: "none" });
  });

  it("never mutates the state it is given", () => {
    const state = Object.freeze(initialSidewalkTouchState());
    expect(() => reduceSidewalkTouch(state, down(hit()))).not.toThrow();
  });
});
