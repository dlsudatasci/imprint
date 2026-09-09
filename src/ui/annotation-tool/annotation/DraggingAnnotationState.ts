import { ReactPictureAnnotation } from "../index";
import { IAnnotationState } from "./AnnotationState";
import { DefaultAnnotationState } from "./DefaultAnnotationState";

/**
 * Active while an existing box is being moved. Resizing is handled separately,
 * by TransformationState.
 *
 * This only repositions a box; its size is never touched. A box already marked
 * "not an obstruction" stays put, because the shape ignores drags once it has
 * been rejected.
 */
export default class DraggingAnnotationState implements IAnnotationState {
  private readonly context: ReactPictureAnnotation;
  constructor(context: ReactPictureAnnotation) {
    this.context = context;
  }

  public onMouseDown = () => undefined;
  public onMouseMove = (positionX: number, positionY: number) => {
    const { shapes } = this.context;
    // Last element is the one being dragged: DefaultAnnotationState moves the
    // shape it picked to the end of the array before handing over here
    const currentShape = shapes[shapes.length - 1];
    currentShape.onDrag(positionX, positionY);
  };

  public onMouseUp = () => {
    const { setAnnotationState } = this.context;
    setAnnotationState(new DefaultAnnotationState(this.context));
  };

  public onMouseLeave = () => this.onMouseUp();
}
