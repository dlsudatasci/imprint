import { ReactPictureAnnotation } from "../index";
import { IAnnotationState } from "./AnnotationState";
import {
  isNearFirstPoint,
  findPointNear,
  findEdgeHandleNear,
  pickShape,
} from "@/features/annotate/sidewalkEditor";

/**
 * Active during the annotator's Sidewalk step (6 Oct 2026). Clicks outline the
 * walking space. It never touches the object boxes.
 *
 * A press, in order of priority:
 *   1. while drawing, closes the shape on its first point, else adds a point
 *   2. on a point of the selected shape, selects it and starts dragging it
 *   3. on an edge handle of the selected shape, adds a point there and drags it
 *   4. inside a shape, selects it
 *   5. anywhere else, starts a new shape
 *
 * Leaving the canvas ends a drag but never cancels a shape being drawn.
 */
export default class SidewalkAnnotationState implements IAnnotationState {
  private readonly context: ReactPictureAnnotation;

  constructor(context: ReactPictureAnnotation) {
    this.context = context;
  }

  public onMouseDown = (positionX: number, positionY: number) => {
    const { context } = this;
    const state = context.getSidewalkState();
    const tolerance = context.sidewalkTolerance;
    const point = { x: positionX, y: positionY };

    if (state.draft) {
      if (state.draft.points.length >= 3 && isNearFirstPoint(state.draft, point, tolerance)) {
        context.dispatchSidewalk({ type: "CLOSE_SHAPE" });
      } else {
        context.dispatchSidewalk({ type: "ADD_POINT", point });
      }
      return;
    }

    const selected = state.mask.polygons.find((p) => p.id === state.selectedId);
    if (selected) {
      const index = findPointNear(selected, point, tolerance);
      if (index != null) {
        context.dispatchSidewalk({ type: "SELECT_POINT", index });
        context.dispatchSidewalk({ type: "START_DRAG", id: selected.id, index });
        return;
      }
      const handle = findEdgeHandleNear(selected, point, tolerance);
      if (handle) {
        context.dispatchSidewalk({ type: "INSERT_POINT", id: selected.id, afterIndex: handle.afterIndex, point: handle.point });
        context.dispatchSidewalk({ type: "START_DRAG", id: selected.id, index: handle.afterIndex + 1 });
        return;
      }
    }

    const hit = pickShape(state.mask.polygons, point);
    if (hit) {
      context.dispatchSidewalk({ type: "SELECT_SHAPE", id: hit.id });
      return;
    }

    context.dispatchSidewalk({ type: "START_SHAPE", point });
  };

  public onMouseMove = (positionX: number, positionY: number) => {
    const state = this.context.getSidewalkState();
    const point = { x: positionX, y: positionY };
    if (state.drag) this.context.dispatchSidewalk({ type: "DRAG_POINT", point });
    else if (state.draft) this.context.dispatchSidewalk({ type: "MOVE_PREVIEW", point });
  };

  public onMouseUp = () => {
    if (this.context.getSidewalkState().drag) this.context.dispatchSidewalk({ type: "END_DRAG" });
  };

  public onMouseLeave = () => this.onMouseUp();
}
