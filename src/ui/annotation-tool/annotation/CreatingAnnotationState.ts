import { ReactPictureAnnotation } from "../index";
import { normalizeMark, isTooSmallToKeep } from "@/util/boxGeometry";
import { IShape } from "../Shape";
import { IAnnotationState } from "./AnnotationState";
import { DefaultAnnotationState } from "./DefaultAnnotationState";

/**
 * Active while a contributor drags out a new box.
 *
 * The zero-sized box already exists by this point — DefaultAnnotationState
 * creates it on the initial press. Movement stretches it, and releasing decides
 * whether this was a real drag or just a click on empty canvas, in which case
 * the box has no size and is discarded.
 */
export default class CreatingAnnotationState implements IAnnotationState {
  private readonly context: ReactPictureAnnotation;
  private readonly currentShape: IShape;

  constructor(context: ReactPictureAnnotation) {
    this.context = context;
    // The shape Default just pushed. Captured here rather than re-read on each
    // event, so selection changes mid-drag can't retarget the resize.
    this.currentShape = context.shapes[context.shapes.length - 1];
  }

  public onMouseDown = () => undefined;
  public onMouseMove = (positionX: number, positionY: number) => {
    if (this.currentShape) {
      const {
        mark: { x, y },
      } = this.currentShape.getAnnotationData();
      this.currentShape.adjustMark({
        width: positionX - x,
        height: positionY - y,
      });
    }
  };

  public onMouseUp = () => {
    const { shapes, onShapeChange, setAnnotationState } = this.context;

    // Pull it out by identity, not by position — a click that lands on empty
    // canvas can reorder the array between mousedown and mouseup
    const shapeIndex = shapes.findIndex((s) => s === this.currentShape);
    const data = shapeIndex !== -1 ? shapes.splice(shapeIndex, 1)[0] : undefined;

    let makeNewBox = false;
    // Zero on either axis means the mouse never actually moved: a click, not a
    // drag. Keeping it would litter the image with invisible boxes that still
    // block submission for being unlabeled.
    //
    // A box thinner than a few screen pixels counts as a click too: it was
    // too small to click afterwards, so it could never be labelled or deleted.
    if (
      data &&
      !isTooSmallToKeep(data.getAnnotationData().mark, this.context.scaleState.scale)
    ) {
      shapes.push(data);
      this.context.selectedId = data.getAnnotationData().id;

      makeNewBox = true;
    } else {
      if (data && this.applyDefaultAnnotationSize(data)) {
        shapes.push(data);
        onShapeChange();
      } else {
        this.context.selectedId = null;
        onShapeChange();
      }
    }
    setAnnotationState(new DefaultAnnotationState(this.context));

    // Select the box just finished and open its label panel, which saves the
    // user a second click, since a new box always needs a label anyway.
    if (makeNewBox) {
      // A box drawn up or to the left keeps its start corner as x, y with a
      // negative size. Normalize the mark in place (4 Oct 2026, both roles).
      const { mark, id } = data.getAnnotationData();
      Object.assign(mark, normalizeMark(mark));
      // By id (8 Oct 2026). A simulated click just inside the new box's corner
      // selected the smallest box under that point, so a box drawn with its
      // corner over a smaller box (a car box over the foot of a pole) opened
      // the pole's panel instead of its own.
      this.context.selectBoxById(id);
    }
  };

  private applyDefaultAnnotationSize = (shape: IShape) => {
    if (this.context.selectedId) {
      // Don't capture clicks meant to de-select another annotation.
      return false;
    }
    if (
      !this.context.defaultAnnotationSize ||
      this.context.defaultAnnotationSize.length !== 2
    ) {
      return false;
    }
    const [width, height] = this.context.defaultAnnotationSize;
    shape.adjustMark({
      width,
      height,
    });
    return true;
  };

  public onMouseLeave = () => this.onMouseUp();
}
