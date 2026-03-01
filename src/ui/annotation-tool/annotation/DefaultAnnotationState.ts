import ReactPictureAnnotation from "../ReactPictureAnnotation";
import { RectShape } from "../Shape";
import Transformer from "../Transformer";
import randomId from "../utils/randomId";
import { IAnnotationState } from "./AnnotationState";
import CreatingAnnotationState from "./CreatingAnnotationState";
import DraggingAnnotationState from "./DraggingAnnotationState";
import TransformationState from "./TransfromationState";

export class DefaultAnnotationState implements IAnnotationState {
  private readonly context: ReactPictureAnnotation;
  constructor(context: ReactPictureAnnotation) {
    this.context = context;
  }

  public onMouseMove = () => undefined;
  public onMouseUp = () => undefined;
  public onMouseLeave = () => undefined;

  public onMouseDown = (positionX: number, positionY: number) => {
    const {
      shapes,
      currentTransformer,
      onShapeChange,
      setAnnotationState: setState,
    } = this.context;

    if (
      currentTransformer &&
      currentTransformer.checkBoundary(positionX, positionY)
    ) {
      currentTransformer.startTransformation(positionX, positionY);
      setState(new TransformationState(this.context));
      return;
    }

    // Find all shapes that the mouse is hovering over
    const intersectingShapes = [];
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (shapes[i].checkBoundary(positionX, positionY)) {
        const mark = shapes[i].getAnnotationData().mark;
        intersectingShapes.push({
          shape: shapes[i],
          originalIndex: i,
          area: mark.width * mark.height
        });
      }
    }

    if (intersectingShapes.length > 0) {
      // Sort intersecting shapes by area (smallest first)
      intersectingShapes.sort((a, b) => a.area - b.area);

      // The target is the smallest matching shape under the cursor
      const target = intersectingShapes[0];

      this.context.selectedId = target.shape.getAnnotationData().id;
      this.context.currentTransformer = new Transformer(
        target.shape,
        this.context.scaleState.scale
      );

      // Bring the selected shape to the front (end of the array) so it renders on top
      const [selectedShape] = shapes.splice(target.originalIndex, 1);
      shapes.push(selectedShape);

      selectedShape.onDragStart(positionX, positionY);
      onShapeChange();
      setState(new DraggingAnnotationState(this.context));
      return;
    }

    this.context.shapes.push(
      new RectShape(
        {
          id: randomId(),
          mark: {
            x: positionX,
            y: positionY,
            width: 0,
            height: 0,
            type: "RECT",
          },
          editable: true,
          selected: false,
        },
        onShapeChange,
        {
          paddingX: 12,
          paddingY: 4,
          lineWidth: 2,
          shadowBlur: 10,
          fontSize: 12,
          fontColor: "#212529",
          fontBackground: "#f8f9fa",
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', Helvetica, Arial, sans-serif",
          shapeBackground: "hsla(210, 16%, 93%, 0.2)",
          shapeStrokeStyle: "orange",
          shapeShadowStyle: "hsla(210, 9%, 31%, 0.35)",
          transformerBackground: "black",
          transformerSize: 10,
        }
      )
    );

    setState(new CreatingAnnotationState(this.context));
  };
}
