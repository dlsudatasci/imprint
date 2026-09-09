/**
 * The interface every canvas interaction mode implements.
 *
 * The canvas reads the same three mouse events differently depending on what
 * the contributor is doing, so rather than tracking a set of flags, the tool
 * swaps in one of four handlers:
 *
 *   Default        idle. A press grabs an existing box, grabs a resize handle,
 *                  or starts drawing a new one
 *   Creating       dragging out a new box; movement resizes it
 *   Dragging       moving an existing box; movement repositions it
 *   Transformation dragging one of the eight resize handles
 *
 * Every mode returns to Default on mouse-up, and all of them treat the cursor
 * leaving the canvas as a mouse-up. Dragging off the edge therefore finishes
 * the box rather than leaving the tool stuck mid-gesture.
 *
 * Modes hand off to each other by calling `setAnnotationState` on
 * ReactPictureAnnotation, which holds the shared data they edit.
 */
export interface IAnnotationState {
  onMouseDown: (positionX: number, positionY: number) => void;
  onMouseMove: (positionX: number, positionY: number) => void;
  onMouseLeave: () => void;
  onMouseUp: () => void;
}
