import { ReactPictureAnnotation } from "../index";
import { IShape } from "../Shape";
import { IAnnotationState } from "./AnnotationState";
import { DefaultAnnotationState } from "./DefaultAnnotationState";

export default class CreatingAnnotationState implements IAnnotationState {
  private readonly context: ReactPictureAnnotation;
  private readonly currentShape: IShape;

  constructor(context: ReactPictureAnnotation) {
    this.context = context;
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

    const shapeIndex = shapes.findIndex((s) => s === this.currentShape);
    const data = shapeIndex !== -1 ? shapes.splice(shapeIndex, 1)[0] : undefined;

    let makeNewBox = false;
    if (
      data &&
      data.getAnnotationData().mark.width !== 0 &&
      data.getAnnotationData().mark.height !== 0
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
    if (makeNewBox) {
      this.context.onMouseDownHack(
        data.getAnnotationData().mark.x + 1,
        data.getAnnotationData().mark.y + 1
      );
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
