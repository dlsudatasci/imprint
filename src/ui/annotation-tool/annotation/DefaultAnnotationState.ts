import ReactPictureAnnotation from "../ReactPictureAnnotation";
import { RectShape } from "../Shape";
import randomId from "../utils/randomId";
import { IAnnotationState } from "./AnnotationState";
import { pickNearSmallBox } from "@/util/boxGeometry";
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
    // A box hidden on the photo (Step 1, 8 Oct 2026) cannot be clicked, so a
    // box can be drawn or fitted underneath it
    const hidden = (i: number) => this.context.isBoxHidden(shapes[i].getAnnotationData().id);
    const intersectingShapes = [];
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (hidden(i)) continue;
      if (shapes[i].checkBoundary(positionX, positionY)) {
        const mark = shapes[i].getAnnotationData().mark;
        intersectingShapes.push({
          shape: shapes[i],
          originalIndex: i,
          area: mark.width * mark.height
        });
      }
    }

    // A click that hit no box may have just missed a small one, whose inside is
    // only a few pixels wide. Select the nearest small box within a few screen
    // pixels rather than starting a new box (6 Oct 2026).
    if (intersectingShapes.length === 0) {
      const near = pickNearSmallBox(
        shapes.map((shape, i) => (hidden(i) ? null : shape.getAnnotationData().mark)),
        positionX,
        positionY,
        this.context.scaleState.scale
      );
      if (near !== null) {
        const mark = shapes[near].getAnnotationData().mark;
        intersectingShapes.push({ shape: shapes[near], originalIndex: near, area: Math.abs(mark.width * mark.height) });
      }
    }

    if (intersectingShapes.length > 0) {
      // Smallest box wins. Picking the topmost instead would make a small box
      // nested inside a large one unreachable, since the large one covers it.
      intersectingShapes.sort((a, b) => a.area - b.area);
      const target = intersectingShapes[0];

      // Selects it, gives it resize handles and moves it to the end of the
      // array, so DraggingAnnotationState (which drags shapes[length - 1]) gets
      // this one. Shared with selectBoxById, which selects a box from the
      // contributor's answer chips or the annotators' list without a click.
      const selectedShape = this.context.selectShapeAt(target.originalIndex);

      selectedShape.onDragStart(positionX, positionY);
      onShapeChange();
      setState(new DraggingAnnotationState(this.context));
      return;
    }

    // Empty canvas — start drawing. The box has zero size until the drag
    // moves; CreatingAnnotationState throws it away if the user just clicked.
    // A press in the band beside the photo starts on the photo's edge (8 Oct 2026).
    const start = this.context.clampToPhoto(positionX, positionY);
    this.context.shapes.push(
      new RectShape(
        {
          id: randomId(),
          mark: {
            x: start.x,
            y: start.y,
            width: 0,
            height: 0,
            type: "RECT",
          },
          editable: true,
          selected: false,
          // When it was drawn, so same-category boxes are numbered in the
          // order drawn (8 Oct 2026). Kept on screen and in the session copy,
          // never submitted.
          drawnOrder: Date.now(),
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
