import { describe, it, expect } from "vitest";
import {
  SIDEWALK_TOOL_COPY,
  sidewalkKeyAction,
  sidewalkShapeNumber,
  sidewalkToolContext,
  sidewalkToolTitle,
  sidewalkToolbarStatus,
  sidewalkTools,
} from "./sidewalkTools";
import { initialSidewalkState, sidewalkReducer } from "./sidewalkEditor";

/**
 * The Sidewalk step's drawing tools (13 Oct 2026): only the ones that apply
 * to what the annotator is doing are shown.
 */
const at = { imageWidth: 640, imageHeight: 360, tolerance: 0 };
const run = (state, ...actions) => actions.reduce((s, action) => sidewalkReducer(s, { ...at, ...action }), state);
const point = (x, y) => ({ x, y });

const idle = () => initialSidewalkState(null);
const drawing = (n = 3) => {
  const points = [point(100, 100), point(300, 100), point(300, 250), point(100, 250), point(60, 180)].slice(0, n);
  return run(idle(), { type: "START_SHAPE", point: points[0] }, ...points.slice(1).map((p) => ({ type: "ADD_POINT", point: p })));
};
/** One finished shape, selected as the editor leaves it */
const withShape = () => run(drawing(4), { type: "CLOSE_SHAPE" });

const keys = (tools) => tools.map((t) => t.key);

describe("sidewalkToolContext", () => {
  it("is idle before anything is drawn, and for a missing or empty state", () => {
    expect(sidewalkToolContext(idle())).toBe("idle");
    expect(sidewalkToolContext(null)).toBe("idle");
    expect(sidewalkToolContext({})).toBe("idle");
  });

  it("is drawing from the first point, and shape once the shape is closed and selected", () => {
    expect(sidewalkToolContext(drawing(1))).toBe("drawing");
    expect(sidewalkToolContext(withShape())).toBe("shape");
  });

  it("goes back to idle when the selection is cleared, or names a shape that is gone", () => {
    expect(sidewalkToolContext(run(withShape(), { type: "CLEAR_SELECTION" }))).toBe("idle");
    expect(sidewalkToolContext({ ...withShape(), selectedId: "w9" })).toBe("idle");
  });
});

describe("sidewalkTools", () => {
  it("shows no tools while there is nothing to act on", () => {
    expect(sidewalkTools(idle())).toEqual([]);
    expect(sidewalkTools(run(withShape(), { type: "CLEAR_SELECTION" }))).toEqual([]);
    expect(sidewalkTools(null)).toEqual([]);
  });

  it("shows Finish, Undo and Cancel while a shape is drawn, with Finish as the main one", () => {
    const tools = sidewalkTools(drawing(2));
    expect(keys(tools)).toEqual(["finish", "undo", "cancel"]);
    expect(tools.map((t) => t.action)).toEqual(["CLOSE_SHAPE", "UNDO_POINT", "CANCEL_SHAPE"]);
    expect(tools.map((t) => t.primary)).toEqual([true, false, false]);
    expect(tools.every((t) => !t.disabled)).toBe(true);
    // The same on a phone or tablet
    expect(keys(sidewalkTools(drawing(2), { touch: true }))).toEqual(["finish", "undo", "cancel"]);
  });

  it("shows Delete point, Delete shape and Done for a selected shape, with Delete point waiting for a point", () => {
    const tools = sidewalkTools(withShape());
    expect(keys(tools)).toEqual(["deletePoint", "deleteShape", "done"]);
    expect(tools.map((t) => t.action)).toEqual(["DELETE_POINT", "DELETE_SHAPE", "CLEAR_SELECTION"]);
    expect(tools.map((t) => t.disabled)).toEqual([true, false, false]);
    expect(tools[0].disabledReason).toBe("Click a point of the shape first.");
    expect(tools.some((t) => t.primary)).toBe(false);

    const pointSelected = sidewalkTools(run(withShape(), { type: "SELECT_POINT", index: 2 }));
    expect(pointSelected.map((t) => t.disabled)).toEqual([false, false, false]);
    expect(pointSelected[0].disabledReason).toBeNull();
  });

  it("leaves Done out on a phone or tablet, where a tap on empty photo clears the selection, and says tap", () => {
    const tools = sidewalkTools(withShape(), { touch: true });
    expect(keys(tools)).toEqual(["deletePoint", "deleteShape"]);
    expect(tools[0].disabledReason).toBe("Tap a point of the shape first.");
  });

  it("uses one set of short labels with full names, none with an em dash or a semicolon", () => {
    expect(SIDEWALK_TOOL_COPY).toEqual({
      finish: { label: "Finish", name: "Finish shape" },
      undo: { label: "Undo", name: "Undo point" },
      cancel: { label: "Cancel", name: "Cancel shape" },
      deletePoint: { label: "Delete point", name: "Delete point" },
      deleteShape: { label: "Delete shape", name: "Delete shape" },
      done: { label: "Done", name: "Done" },
      photoOnly: { label: "Photo only", name: "Show photo only" },
    });
    for (const { label, name } of Object.values(SIDEWALK_TOOL_COPY)) {
      // A screen reader's name has to hold the words on the button
      expect(name.toLowerCase()).toContain(label.toLowerCase());
      expect(`${label} ${name}`).not.toMatch(/[—;]/);
    }
    for (const t of [...sidewalkTools(drawing(3)), ...sidewalkTools(withShape())]) {
      expect(t.label).toBe(SIDEWALK_TOOL_COPY[t.key].label);
      expect(t.name).toBe(SIDEWALK_TOOL_COPY[t.key].name);
    }
  });

  it("gives every tool an action the editor carries out", () => {
    // Finish, then Delete point, Delete shape and Done, each change the editor
    const closed = run(drawing(4), { type: sidewalkTools(drawing(4))[0].action });
    expect(closed.mask.polygons).toHaveLength(1);
    expect(run(drawing(3), { type: "UNDO_POINT" }).draft.points).toHaveLength(2);
    expect(run(drawing(3), { type: "CANCEL_SHAPE" }).draft).toBeNull();
    const selected = run(withShape(), { type: "SELECT_POINT", index: 0 });
    const [deletePoint, deleteShape, done] = sidewalkTools(selected);
    expect(run(selected, { type: deletePoint.action }).mask.polygons[0].points).toHaveLength(3);
    expect(run(selected, { type: deleteShape.action }).mask.polygons).toHaveLength(0);
    expect(run(selected, { type: done.action }).selectedId).toBeNull();
  });
});

describe("sidewalkKeyAction and the tools' shortcuts", () => {
  it("runs the same keys as before: Enter, Escape, Backspace and Delete", () => {
    expect(sidewalkKeyAction("Enter", drawing(3))).toBe("CLOSE_SHAPE");
    expect(sidewalkKeyAction("Enter", withShape())).toBeNull();
    expect(sidewalkKeyAction("Escape", drawing(1))).toBe("CANCEL_SHAPE");
    expect(sidewalkKeyAction("Escape", withShape())).toBe("CLEAR_SELECTION");
    expect(sidewalkKeyAction("Escape", idle())).toBe("CLEAR_SELECTION");
    expect(sidewalkKeyAction("Backspace", drawing(2))).toBe("UNDO_POINT");
    expect(sidewalkKeyAction("Backspace", withShape())).toBeNull();
    expect(sidewalkKeyAction("Delete", withShape())).toBe("DELETE_SHAPE");
    expect(sidewalkKeyAction("Delete", idle())).toBeNull();
    expect(sidewalkKeyAction("Delete", drawing(2))).toBeNull();
    const pointSelected = run(withShape(), { type: "SELECT_POINT", index: 1 });
    expect(sidewalkKeyAction("Backspace", pointSelected)).toBe("DELETE_POINT");
    expect(sidewalkKeyAction("Delete", pointSelected)).toBe("DELETE_POINT");
    expect(sidewalkKeyAction("a", drawing(2))).toBeNull();
    expect(sidewalkKeyAction("Enter", null)).toBeNull();
  });

  it("never shows a key in a tooltip that does something else", () => {
    const states = [drawing(1), drawing(4), withShape(), run(withShape(), { type: "SELECT_POINT", index: 1 })];
    let checked = 0;
    for (const state of states) {
      for (const t of sidewalkTools(state)) {
        if (!t.shortcutKey || t.disabled) continue;
        expect(sidewalkKeyAction(t.shortcutKey, state)).toBe(t.action);
        checked += 1;
      }
    }
    // Finish, Undo, Cancel twice, Delete shape and Done, then Delete point and Done
    expect(checked).toBe(10);
  });

  it("drops Delete from Delete shape's tooltip while a point is selected, since the key removes the point", () => {
    expect(sidewalkTools(withShape()).find((t) => t.key === "deleteShape").shortcut).toBe("Delete");
    const pointSelected = run(withShape(), { type: "SELECT_POINT", index: 1 });
    expect(sidewalkTools(pointSelected).find((t) => t.key === "deleteShape").shortcut).toBeNull();
    expect(sidewalkTools(pointSelected).find((t) => t.key === "deletePoint").shortcut).toBe("Backspace");
  });
});

describe("sidewalkToolTitle", () => {
  it("names the tool with its key, says why it is greyed out, and leaves keys out where there is no keyboard", () => {
    const [finish, undo, cancel] = sidewalkTools(drawing(3));
    expect([finish, undo, cancel].map((t) => sidewalkToolTitle(t))).toEqual(["Finish shape (Enter)", "Undo point (Backspace)", "Cancel shape (Esc)"]);
    expect(sidewalkToolTitle(finish, { keys: false })).toBe("Finish shape");
    const [deletePoint, deleteShape, done] = sidewalkTools(withShape());
    expect(sidewalkToolTitle(deletePoint)).toBe("Delete point. Click a point of the shape first.");
    expect(sidewalkToolTitle(deleteShape)).toBe("Delete shape (Delete)");
    expect(sidewalkToolTitle(done)).toBe("Done (Esc)");
    expect(sidewalkToolTitle(sidewalkTools(withShape(), { touch: true })[0], { keys: false })).toBe("Delete point. Tap a point of the shape first.");
  });
});

describe("sidewalkToolbarStatus", () => {
  it("says what to do next when there are no tools, with tap for a finger", () => {
    expect(sidewalkToolbarStatus(idle())).toBe("Click the photo to start a shape.");
    expect(sidewalkToolbarStatus(idle(), "touch")).toBe("Tap the photo to start a shape.");
    const unselected = run(withShape(), { type: "CLEAR_SELECTION" });
    expect(sidewalkToolbarStatus(unselected)).toBe("Click a shape to select it, or click the photo to start another.");
    expect(sidewalkToolbarStatus(unselected, "touch")).toBe("Tap a shape to select it, or tap the photo to start another.");
    expect(sidewalkToolbarStatus(run(idle(), { type: "SET_NO_SIDEWALK", value: true }))).toBe("No sidewalk is ticked.");
    expect(sidewalkToolbarStatus(null)).toBe("Click the photo to start a shape.");
  });

  it("counts the points of the shape being drawn", () => {
    expect(sidewalkToolbarStatus(drawing(1))).toBe("Drawing a shape: 1 point");
    expect(sidewalkToolbarStatus(drawing(4))).toBe("Drawing a shape: 4 points");
  });

  it("names the selected shape as its chip does, and the selected point", () => {
    expect(sidewalkToolbarStatus(withShape())).toBe("Shape 1: 4 points");
    expect(sidewalkToolbarStatus(run(withShape(), { type: "SELECT_POINT", index: 2 }))).toBe("Shape 1: point 3 of 4");
    expect(sidewalkShapeNumber("w12")).toBe("12");
    expect(sidewalkShapeNumber(undefined)).toBe("");
  });

  it("never says click to a finger, and has no em dash or semicolon", () => {
    const states = [idle(), drawing(2), withShape(), run(withShape(), { type: "CLEAR_SELECTION" }), run(idle(), { type: "SET_NO_SIDEWALK", value: true })];
    for (const state of states) {
      expect(sidewalkToolbarStatus(state, "touch")).not.toMatch(/click/i);
      for (const words of ["pointer", "touch"]) expect(sidewalkToolbarStatus(state, words)).not.toMatch(/[—;]/);
    }
  });
});
