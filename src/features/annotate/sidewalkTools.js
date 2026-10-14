/**
 * The drawing tools of the annotators' Sidewalk step, and which of them apply
 * (13 Oct 2026, the adviser's request for a better toolbar).
 *
 * Before, six buttons sat in a row above the photo at all times: Finish shape,
 * Undo point, Cancel shape, Delete point, Delete shape and Show photo only.
 * At least two were greyed out whatever the annotator was doing (five before
 * the first point), and on a window narrower than about 1440 px the row
 * wrapped onto a second line. Now the bar shows only the tools for what is
 * happening:
 *
 *   drawing  a shape is being drawn: Finish, Undo, Cancel
 *   shape    a finished shape is selected: Delete point, Delete shape, Done
 *   idle     neither: no tools, only what to do next
 *
 * Photo only is a view setting, not an edit, so it is always there and is not
 * part of this list. One rule and one set of labels for the desktop bar, the
 * answers sheet on a phone or tablet, and the full-screen photo, so the three
 * cannot drift apart. Pure, so it is tested without a canvas.
 *
 * A pop-up beside the shape, like the box panel in Objects, was considered and
 * turned down. That panel asks something every box needs answered. A shape
 * needs no answer, and a pop-up on the photo would cover the place where the
 * next point or the next shape goes.
 */

/** The label on the button, and its full name for screen readers and tooltips. */
export const SIDEWALK_TOOL_COPY = Object.freeze({
  finish: Object.freeze({ label: "Finish", name: "Finish shape" }),
  undo: Object.freeze({ label: "Undo", name: "Undo point" }),
  cancel: Object.freeze({ label: "Cancel", name: "Cancel shape" }),
  deletePoint: Object.freeze({ label: "Delete point", name: "Delete point" }),
  deleteShape: Object.freeze({ label: "Delete shape", name: "Delete shape" }),
  done: Object.freeze({ label: "Done", name: "Done" }),
  photoOnly: Object.freeze({ label: "Photo only", name: "Show photo only" }),
});

/** The number shown for a shape: "w3" is Shape 3. */
export function sidewalkShapeNumber(id) {
  return typeof id === "string" ? id.replace(/^[a-z]+/, "") : "";
}

const selectedPolygon = (state) =>
  state?.selectedId == null ? null : (state.mask?.polygons || []).find((p) => p.id === state.selectedId) || null;

/** What the annotator is doing: "drawing", "shape" (one is selected) or "idle". */
export function sidewalkToolContext(state) {
  if (state?.draft) return "drawing";
  if (selectedPolygon(state)) return "shape";
  return "idle";
}

/**
 * The editor action a key runs in this state, or null. The one place the
 * shortcuts are decided: the tool's key handler runs it, and the tooltips
 * below are checked against it.
 *
 *   Enter      closes the shape being drawn
 *   Escape     cancels the shape being drawn, otherwise clears the selection
 *   Backspace  removes the last point drawn, or the selected point
 *   Delete     removes the selected point, or the selected shape when no point is selected
 */
export function sidewalkKeyAction(key, state) {
  const drawing = Boolean(state?.draft);
  const pointSelected = state?.selectedPoint != null;
  if (key === "Enter") return drawing ? "CLOSE_SHAPE" : null;
  if (key === "Escape") return drawing ? "CANCEL_SHAPE" : "CLEAR_SELECTION";
  if (key === "Backspace") return drawing ? "UNDO_POINT" : pointSelected ? "DELETE_POINT" : null;
  if (key === "Delete") return pointSelected ? "DELETE_POINT" : state?.selectedId ? "DELETE_SHAPE" : null;
  return null;
}

/** How a key is written in a tooltip. */
const KEY_LABEL = Object.freeze({ Enter: "Enter", Escape: "Esc", Backspace: "Backspace", Delete: "Delete" });

function tool(key, action, extra = {}) {
  const shortcutKey = extra.shortcutKey ?? null;
  return {
    key,
    action,
    label: SIDEWALK_TOOL_COPY[key].label,
    name: SIDEWALK_TOOL_COPY[key].name,
    shortcutKey,
    shortcut: shortcutKey ? KEY_LABEL[shortcutKey] : null,
    disabled: extra.disabled === true,
    disabledReason: extra.disabled === true ? extra.disabledReason ?? null : null,
    primary: extra.primary === true,
  };
}

/**
 * The tools for this state, in order. `touch` is a phone or tablet: no Done
 * there, since a tap on empty photo clears the selection, and no mouse does.
 *
 * Each tool: { key, action, label, name, shortcut, shortcutKey, disabled,
 * disabledReason, primary }. `action` is the editor action it dispatches.
 */
export function sidewalkTools(state, { touch = false } = {}) {
  const context = sidewalkToolContext(state);
  if (context === "drawing") {
    return [
      tool("finish", "CLOSE_SHAPE", { shortcutKey: "Enter", primary: true }),
      tool("undo", "UNDO_POINT", { shortcutKey: "Backspace" }),
      tool("cancel", "CANCEL_SHAPE", { shortcutKey: "Escape" }),
    ];
  }
  if (context === "shape") {
    const pointSelected = state.selectedPoint != null;
    const tools = [
      tool("deletePoint", "DELETE_POINT", {
        shortcutKey: "Backspace",
        disabled: !pointSelected,
        disabledReason: touch ? "Tap a point of the shape first." : "Click a point of the shape first.",
      }),
      // The Delete key removes the selected point while one is selected
      tool("deleteShape", "DELETE_SHAPE", { shortcutKey: pointSelected ? null : "Delete" }),
    ];
    if (!touch) tools.push(tool("done", "CLEAR_SELECTION", { shortcutKey: "Escape" }));
    return tools;
  }
  return [];
}

/** A tool's tooltip: its name, why it is greyed out, or its key. */
export function sidewalkToolTitle(entry, { keys = true } = {}) {
  if (entry.disabled && entry.disabledReason) return `${entry.name}. ${entry.disabledReason}`;
  if (keys && entry.shortcut) return `${entry.name} (${entry.shortcut})`;
  return entry.name;
}

/**
 * The line at the left of the desktop bar: what the tools beside it are for,
 * or what to do next when there are none. `words` is "pointer" or "touch".
 */
export function sidewalkToolbarStatus(state, words = "pointer") {
  const context = sidewalkToolContext(state);
  if (context === "drawing") {
    const n = state.draft.points?.length ?? 0;
    return `Drawing a shape: ${n} ${n === 1 ? "point" : "points"}`;
  }
  if (context === "shape") {
    const polygon = selectedPolygon(state);
    const number = sidewalkShapeNumber(polygon.id);
    const count = polygon.points?.length ?? 0;
    if (state.selectedPoint != null) return `Shape ${number}: point ${state.selectedPoint + 1} of ${count}`;
    return `Shape ${number}: ${count} points`;
  }
  const shapes = state?.mask?.polygons?.length ?? 0;
  if (shapes === 0 && state?.mask?.noSidewalk === true) return "No sidewalk is ticked.";
  const touch = words === "touch";
  if (shapes === 0) return touch ? "Tap the photo to start a shape." : "Click the photo to start a shape.";
  return touch
    ? "Tap a shape to select it, or tap the photo to start another."
    : "Click a shape to select it, or click the photo to start another.";
}
