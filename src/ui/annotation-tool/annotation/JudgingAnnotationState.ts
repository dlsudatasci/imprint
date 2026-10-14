import { ReactPictureAnnotation } from "../index";
import { IAnnotationState } from "./AnnotationState";
import { pickJudgeTarget } from "@/features/annotate/obstructionStep";

/**
 * Active during the annotator's Obstructions step (4 Oct 2026).
 *
 * The boxes are locked: a press toggles the obstruction mark on the real object
 * whose label is under the cursor, else the one under it (the smallest, when
 * boxes overlap), and does nothing else. It
 * never creates, drags or resizes a box and never opens the box panel.
 * Closing a panel (closePanel) leaves this state in place.
 */
export default class JudgingAnnotationState implements IAnnotationState {
  private readonly context: ReactPictureAnnotation;

  constructor(context: ReactPictureAnnotation) {
    this.context = context;
  }

  public onMouseDown = (positionX: number, positionY: number) => {
    // A box's label first: it is drawn over the boxes and often wider than its box
    const labelled = this.context.judgeLabelAt({ x: positionX, y: positionY });
    if (labelled) {
      this.context.toggleObstruction(labelled);
      return;
    }
    const target = pickJudgeTarget(
      this.context.shapes.map((shape) => shape.getAnnotationData()),
      positionX,
      positionY
    );
    if (target) this.context.toggleObstruction(target.id);
  };

  public onMouseMove = () => undefined;
  public onMouseUp = () => undefined;
  public onMouseLeave = () => undefined;
}
