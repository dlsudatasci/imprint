import ReactPictureAnnotation from "../ReactPictureAnnotation";
import { RectShape } from "../Shape";
import Transformer from "../Transformer";
import randomId from "../utils/randomId";
import { IAnnotationState } from "./AnnotationState";
import CreatingAnnotationState from "./CreatingAnnotationState";
import DraggingAnnotationState from "./DraggingAnnotationState";
import TransformationState from "./TransformationState";

/**
 * The resting state. Nothing is being dragged, so the only event that matters
 * is a press, and where it lands decides what happens next.
 *
 * The order of those checks matters: resize handles are tested before boxes,
 * and boxes before empty canvas. Handles sit on top of a box's own outline, so
 * checking boxes first would make the corners impossible to grab.
 */
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

    // Boxes overlap constantly on a busy sidewalk — a tree inside a planter
    // inside a wide "cracked pavement" region. Collect everything under the
    // cursor rather than taking the first hit.
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
      // Smallest box wins. Picking the topmost instead would make a small box
      // nested inside a large one unreachable, since the large one covers it.
      intersectingShapes.sort((a, b) => a.area - b.area);
      const target = intersectingShapes[0];

      this.context.selectedId = target.shape.getAnnotationData().id;
      this.context.currentTransformer = new Transformer(
        target.shape,
        this.context.scaleState.scale
      );

      // Move it to the end of the array so it paints last (on top) — and so
      // DraggingAnnotationState, which drags shapes[length - 1], gets this one
      const [selectedShape] = shapes.splice(target.originalIndex, 1);
      shapes.push(selectedShape);

      selectedShape.onDragStart(positionX, positionY);
      onShapeChange();
      setState(new DraggingAnnotationState(this.context));
      return;
    }

    // Empty canvas — start drawing. The box has zero size until the drag
    // moves; CreatingAnnotationState throws it away if the user just clicked.
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
          fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', Helvetica, Arial, sans-serif",
          shapeBackground: "hsla(210, 16%, 93%, 0.2)",
          shapeStrokeStyle: "#16a34a",
          shapeShadowStyle: "hsla(210, 9%, 31%, 0.35)",
          transformerBackground: "#111827",
          transformerSize: 10,
        }
      )
    );

    setState(new CreatingAnnotationState(this.context));
  };
}
