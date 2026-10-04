import { ReactPictureAnnotation } from "../index";
import { normalizeMark } from "@/util/boxGeometry";
import { IAnnotationState } from "./AnnotationState";
import { DefaultAnnotationState } from "./DefaultAnnotationState";

/**
 * Active while one of the eight resize handles is being dragged.
 *
 * The transformer already knows which handle was grabbed, so this forwards
 * cursor positions to it and does nothing else.
 */
export default class TransformationState implements IAnnotationState {
  private readonly context: ReactPictureAnnotation;
  constructor(context: ReactPictureAnnotation) {
    this.context = context;
  }

  public onMouseDown = () => undefined;
  public onMouseMove = (positionX: number, positionY: number) => {
    const { currentTransformer } = this.context;
    if (currentTransformer) {
      currentTransformer.onTransformation(positionX, positionY);
    }
  };

  public onMouseUp = () => {
    const { setAnnotationState, shapes, selectedId, onShapeChange } = this.context;

    // Resizing past the opposite edge flips the sign of the width or height.
    // The shape edits the original data object, so normalize that mark in
    // place (4 Oct 2026, both roles).
    const shape = shapes.find((s) => s.getAnnotationData().id === selectedId);
    if (shape) {
      const { mark } = shape.getAnnotationData();
      Object.assign(mark, normalizeMark(mark));
      onShapeChange();
    }

    setAnnotationState(new DefaultAnnotationState(this.context));
  };

  public onMouseLeave = () => this.onMouseUp();
}
