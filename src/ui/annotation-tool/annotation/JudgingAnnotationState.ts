import { ReactPictureAnnotation } from "../index";
import { IAnnotationState } from "./AnnotationState";
import { pickJudgeTarget } from "@/features/annotate/obstructionStep";

/**
 * Active during the annotator's Obstructions step (4 Oct 2026).
 *
 * The boxes are locked: a press toggles the obstruction mark on the real object
 * under the cursor (the smallest, when boxes overlap) and does nothing else. It
 * never creates, drags or resizes a box and never opens the box panel.
 * Closing a panel (closePanel) leaves this state in place.
 */
export default class JudgingAnnotationState implements IAnnotationState {
  private readonly context: ReactPictureAnnotation;

  constructor(context: ReactPictureAnnotation) {
    this.context = context;
  }

  public onMouseDown = (positionX: number, positionY: number) => {
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
