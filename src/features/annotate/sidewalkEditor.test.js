import { describe, it, expect } from "vitest";
import {
  initialSidewalkState,
  sidewalkReducer,
  snapToImageEdge,
  findPointNear,
  findEdgeHandleNear,
  pickShape,
  pointInPolygon,
  isNearFirstPoint,
  SIDEWALK_EDITOR_MESSAGES as M,
} from "./sidewalkEditor.js";
import { SIDEWALK_MASK_LIMITS } from "@/util/validators/sidewalkMask";

const W = 640;
const H = 360;
const TOL = 8;
const ctx = { imageWidth: W, imageHeight: H, tolerance: TOL };
const pt = (x, y) => ({ x, y });

/** Runs actions in order, each with the image size and tolerance. */
function run(state, ...actions) {
  return actions.reduce((s, a) => sidewalkReducer(s, { ...ctx, ...a }), state);
}

/** Draws and closes a shape through the given points with the current tool. */
function drawShape(state, points) {
  const [first, ...rest] = points;
  return run(
    state,
    { type: "START_SHAPE", point: first },
    ...rest.map((point) => ({ type: "ADD_POINT", point })),
    { type: "CLOSE_SHAPE" }
  );
}

const square = (x, y, s) => [pt(x, y), pt(x + s, y), pt(x + s, y + s), pt(x, y + s)];

describe("initialSidewalkState", () => {
  it("starts empty, with no tool to choose (cut outs removed 6 Oct 2026)", () => {
    const s = initialSidewalkState(null);
    expect(s).toMatchObject({ mask: { noSidewalk: false, polygons: [] }, draft: null, selectedId: null, drag: null, message: null });
    expect(s).not.toHaveProperty("tool");
  });

  it("drops cut outs from a saved mask and keeps the walking-space shapes", () => {
    const saved = {
      noSidewalk: false,
      polygons: [
        { id: "w1", kind: "walk", points: square(10, 10, 50) },
        { id: "c1", kind: "cutout", points: square(20, 20, 10) },
        { id: "w2", kind: "walk", points: square(100, 10, 50) },
      ],
    };
    expect(initialSidewalkState(saved).mask.polygons.map((p) => p.id)).toEqual(["w1", "w2"]);
  });

  it("starts from a saved mask without sharing it", () => {
    const saved = { noSidewalk: false, polygons: [{ id: "w1", kind: "walk", points: square(10, 10, 50) }] };
    const s = initialSidewalkState(saved);
    expect(s.mask).toEqual(saved);
    expect(s.mask.polygons[0].points).not.toBe(saved.polygons[0].points);
  });
});

describe("drawing shapes", () => {
  it("closes every shape as walking space, w1 then w2", () => {
    let s = drawShape(initialSidewalkState(null), square(20, 20, 100));
    expect(s.mask.polygons.map((p) => p.id)).toEqual(["w1"]);
    expect(s.selectedId).toBe("w1");
    expect(s.draft).toBeNull();
    s = drawShape(s, square(200, 20, 100));
    // Asking for the old Cut out tool still draws walking space
    s = run(s, { type: "SET_TOOL", tool: "cutout" });
    s = drawShape(s, square(40, 40, 20));
    expect(s.mask.polygons.map((p) => `${p.id}:${p.kind}`)).toEqual(["w1:walk", "w2:walk", "w3:walk"]);
  });

  it("refuses to close with two points, and keeps the draft", () => {
    const s = run(initialSidewalkState(null),
      { type: "START_SHAPE", point: pt(20, 20) },
      { type: "ADD_POINT", point: pt(100, 20) },
      { type: "CLOSE_SHAPE" });
    expect(s.mask.polygons).toEqual([]);
    expect(s.draft.points).toHaveLength(2);
    expect(s.message).toBe(M.tooFewPoints);
  });

  it("refuses to close a self-crossing draft with the message", () => {
    const s = drawShape(initialSidewalkState(null), [pt(20, 20), pt(120, 120), pt(120, 20), pt(20, 120)]);
    expect(s.mask.polygons).toEqual([]);
    expect(s.message).toBe("The outline crosses itself. Move or remove a point.");
  });

  it("undoes the last point, and cancels the draft at one point", () => {
    let s = run(initialSidewalkState(null),
      { type: "START_SHAPE", point: pt(20, 20) },
      { type: "ADD_POINT", point: pt(100, 20) },
      { type: "UNDO_POINT" });
    expect(s.draft.points).toEqual([pt(20, 20)]);
    s = run(s, { type: "UNDO_POINT" });
    expect(s.draft).toBeNull();
  });

  it("cancels a draft", () => {
    const s = run(initialSidewalkState(null), { type: "START_SHAPE", point: pt(20, 20) }, { type: "CANCEL_SHAPE" });
    expect(s.draft).toBeNull();
    expect(s.mask.polygons).toEqual([]);
  });

  it("leaves the state unchanged on SET_TOOL, which no longer exists", () => {
    const before = initialSidewalkState(null);
    expect(sidewalkReducer(before, { ...ctx, type: "SET_TOOL", tool: "cutout" })).toBe(before);
    const drawing = run(before, { type: "START_SHAPE", point: pt(20, 20) });
    expect(sidewalkReducer(drawing, { ...ctx, type: "SET_TOOL", tool: "cutout" })).toBe(drawing);
    expect(drawing.draft.kind).toBe("walk");
  });
});

describe("snapping and clamping", () => {
  it("snaps points near each image edge onto it", () => {
    expect(snapToImageEdge(pt(5, 100), W, H, TOL)).toEqual(pt(0, 100));
    expect(snapToImageEdge(pt(635, 100), W, H, TOL)).toEqual(pt(W, 100));
    expect(snapToImageEdge(pt(100, 6), W, H, TOL)).toEqual(pt(100, 0));
    expect(snapToImageEdge(pt(100, 355), W, H, TOL)).toEqual(pt(100, H));
    expect(snapToImageEdge(pt(100, 100), W, H, TOL)).toEqual(pt(100, 100));
  });

  it("clamps points outside the image as they are added", () => {
    const s = run(initialSidewalkState(null),
      { type: "START_SHAPE", point: pt(-40, 500) },
      { type: "ADD_POINT", point: pt(900, 200) });
    expect(s.draft.points).toEqual([pt(0, H), pt(W, 200)]);
  });
});

describe("limits", () => {
  it("ignores a point past the maximum, with a message", () => {
    const { maxPoints } = SIDEWALK_MASK_LIMITS;
    let s = run(initialSidewalkState(null), { type: "START_SHAPE", point: pt(10, 10) });
    s = { ...s, draft: { ...s.draft, points: Array.from({ length: maxPoints }, (_, i) => pt(10 + i, 10 + (i % 2))) } };
    const next = run(s, { type: "ADD_POINT", point: pt(500, 300) });
    expect(next.draft.points).toHaveLength(maxPoints);
    expect(next.message).toBe(M.tooManyPoints);
  });

  it("refuses another shape at the maximum, with a message", () => {
    const { maxPolygons } = SIDEWALK_MASK_LIMITS;
    const full = initialSidewalkState({
      noSidewalk: false,
      polygons: Array.from({ length: maxPolygons }, (_, i) => ({ id: `w${i + 1}`, kind: "walk", points: square(i * 10, 0, 5) })),
    });
    const s = run(full, { type: "START_SHAPE", point: pt(300, 300) });
    expect(s.draft).toBeNull();
    expect(s.message).toBe(M.tooManyShapes);
  });
});

describe("editing a shape", () => {
  const withSquare = () => drawShape(initialSidewalkState(null), square(100, 100, 100));

  it("refuses to delete a point below three points", () => {
    const triangle = drawShape(initialSidewalkState(null), [pt(100, 100), pt(200, 100), pt(100, 200)]);
    const s = run(triangle, { type: "SELECT_POINT", index: 0 }, { type: "DELETE_POINT" });
    expect(s.mask.polygons[0].points).toHaveLength(3);
    expect(s.message).toBe(M.deletePointTooFew);
  });

  it("deletes a point and a shape", () => {
    let s = run(withSquare(), { type: "SELECT_POINT", index: 3 }, { type: "DELETE_POINT" });
    expect(s.mask.polygons[0].points).toEqual([pt(100, 100), pt(200, 100), pt(200, 200)]);
    s = run(s, { type: "DELETE_SHAPE" });
    expect(s.mask.polygons).toEqual([]);
    expect(s.selectedId).toBeNull();
  });

  it("inserts a point on an edge and selects it", () => {
    const s = run(withSquare(), { type: "INSERT_POINT", id: "w1", afterIndex: 0, point: pt(150, 100) });
    expect(s.mask.polygons[0].points).toEqual([pt(100, 100), pt(150, 100), pt(200, 100), pt(200, 200), pt(100, 200)]);
    expect(s.selectedPoint).toBe(1);
  });

  it("drags a point, and undoes a drag that makes the outline cross itself", () => {
    let s = run(withSquare(), { type: "START_DRAG", id: "w1", index: 2 }, { type: "DRAG_POINT", point: pt(250, 260) }, { type: "END_DRAG" });
    expect(s.mask.polygons[0].points[2]).toEqual(pt(250, 260));
    expect(s.drag).toBeNull();
    expect(s.message).toBeNull();

    s = withSquare();
    const before = s.mask.polygons[0].points;
    // Moving the bottom-left corner past the right edge crosses the outline
    s = run(s, { type: "START_DRAG", id: "w1", index: 3 }, { type: "DRAG_POINT", point: pt(300, 150) }, { type: "END_DRAG" });
    expect(s.mask.polygons[0].points).toEqual(before);
    expect(s.message).toBe("That move would make the outline cross itself, so it was undone.");
  });
});

describe("No sidewalk", () => {
  it("cannot be ticked while shapes exist or a shape is being drawn", () => {
    let s = run(drawShape(initialSidewalkState(null), square(10, 10, 50)), { type: "SET_NO_SIDEWALK", value: true });
    expect(s.mask.noSidewalk).toBe(false);
    expect(s.message).toBe("Delete the shapes first.");
    s = run(initialSidewalkState(null), { type: "START_SHAPE", point: pt(5, 5) }, { type: "SET_NO_SIDEWALK", value: true });
    expect(s.mask.noSidewalk).toBe(false);
  });

  it("can be ticked with no shapes and always unticked", () => {
    let s = run(initialSidewalkState(null), { type: "SET_NO_SIDEWALK", value: true });
    expect(s.mask.noSidewalk).toBe(true);
    s = run(s, { type: "SET_NO_SIDEWALK", value: false });
    expect(s.mask.noSidewalk).toBe(false);
  });

  it("blocks drawing while ticked", () => {
    const s = run(initialSidewalkState(null), { type: "SET_NO_SIDEWALK", value: true }, { type: "START_SHAPE", point: pt(20, 20) });
    expect(s.draft).toBeNull();
    expect(s.message).toBe("Untick No sidewalk to draw.");
  });
});

describe("hit-testing", () => {
  const walkShape = { id: "w1", kind: "walk", points: square(0, 0, 200) };
  const small = { id: "w2", kind: "walk", points: square(150, 150, 20) };
  const middle = { id: "w3", kind: "walk", points: square(140, 140, 50) };

  it("returns the smallest shape containing the point, in any order", () => {
    expect(pickShape([walkShape, middle, small], pt(160, 160)).id).toBe("w2");
    expect(pickShape([small, middle, walkShape], pt(160, 160)).id).toBe("w2");
    expect(pickShape([walkShape, middle, small], pt(145, 145)).id).toBe("w3");
    expect(pickShape([walkShape, small], pt(10, 10)).id).toBe("w1");
    expect(pickShape([walkShape], pt(500, 500))).toBeNull();
    // The kind no longer matters: a larger legacy cut out does not beat a smaller shape
    const legacyCutout = { id: "c1", kind: "cutout", points: square(100, 100, 100) };
    expect(pickShape([legacyCutout, small], pt(160, 160)).id).toBe("w2");
  });

  it("finds points, edge handles and the first point within the tolerance", () => {
    expect(pointInPolygon(pt(10, 10), walkShape.points)).toBe(true);
    expect(findPointNear(walkShape, pt(203, 198), TOL)).toBe(2);
    expect(findPointNear(walkShape, pt(100, 100), TOL)).toBeNull();
    expect(findEdgeHandleNear(walkShape, pt(102, 3), TOL)).toEqual({ afterIndex: 0, point: pt(100, 0) });
    expect(findEdgeHandleNear(walkShape, pt(50, 50), TOL)).toBeNull();
    const draft = { kind: "walk", points: [pt(10, 10), pt(100, 10)] };
    expect(isNearFirstPoint(draft, pt(14, 12), TOL)).toBe(true);
    expect(isNearFirstPoint(draft, pt(40, 40), TOL)).toBe(false);
  });
});

describe("no action mutates its input state", () => {
  it("leaves every input state as it was", () => {
    const states = [];
    let s = initialSidewalkState({ noSidewalk: false, polygons: [{ id: "w1", kind: "walk", points: square(100, 100, 100) }] });
    const actions = [
      { type: "SELECT_SHAPE", id: "w1" },
      { type: "SELECT_POINT", index: 1 },
      { type: "START_DRAG", id: "w1", index: 1 },
      { type: "DRAG_POINT", point: pt(230, 90) },
      { type: "END_DRAG" },
      { type: "INSERT_POINT", id: "w1", afterIndex: 0, point: pt(150, 100) },
      { type: "DELETE_POINT" },
      { type: "SET_TOOL", tool: "cutout" },
      { type: "START_SHAPE", point: pt(120, 120) },
      { type: "ADD_POINT", point: pt(160, 120) },
      { type: "MOVE_PREVIEW", point: pt(150, 160) },
      { type: "ADD_POINT", point: pt(140, 160) },
      { type: "CLOSE_SHAPE" },
      { type: "DELETE_SHAPE" },
      { type: "CLEAR_SELECTION" },
    ];
    for (const action of actions) {
      const snapshot = structuredClone(s);
      states.push(s);
      const next = sidewalkReducer(s, { ...ctx, ...action });
      expect(s).toEqual(snapshot);
      s = next;
    }
  });
});
