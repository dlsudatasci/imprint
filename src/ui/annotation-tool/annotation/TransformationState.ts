import { ReactPictureAnnotation } from "../index";
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
    const { setAnnotationState } = this.context;
    setAnnotationState(new DefaultAnnotationState(this.context));
  };

  public onMouseLeave = () => this.onMouseUp();
}
