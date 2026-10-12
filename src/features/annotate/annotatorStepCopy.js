/**
 * The words under each annotator step's heading, and the Sidewalk Outline
 * card's hint (12 Oct 2026).
 *
 * Two versions of each. "pointer" is the desktop copy, word for word as it
 * was. "touch" says "tap" and names what a finger does instead: Add box, since
 * a finger's drag never draws a box, and Finish shape, since there is no hover
 * to show the first point can be closed. The tool uses the touch version on
 * the sheet layout, and on the desktop layout when a finger is the primary
 * pointer (an iPad held sideways), the same rule as the tours' wording.
 */

export const ANNOTATOR_STEP_COPY = Object.freeze({
  pointer: Object.freeze({
    objects: "Box every object from the 18 categories that you can see anywhere in the image, on the sidewalk or not. For each dashed yellow suggestion, check its category, fix the box if it is loose, then click Keep, or click Not an object if it marks nothing real. Draw a box for every object the suggestions missed.",
    sidewalk: "Outline the walking space in this image. Click points around the sidewalk and click the first point again to close the shape. Draw under any object standing on the sidewalk, as if it were not there.",
    obstructions: "Click every object that obstructs the sidewalk for you, traveling as you normally do. Click it again to unmark it. Leave the others unmarked, then confirm below that they do not obstruct.",
  }),
  touch: Object.freeze({
    objects: "Box every object from the 18 categories that you can see anywhere in the image, on the sidewalk or not. For each dashed yellow suggestion, check its category, fit the box if it is loose, then tap Keep, or tap Not an object if it marks nothing real. Tap Add box for every object the suggestions missed.",
    sidewalk: "Outline the walking space in this image. Tap points around the sidewalk, then tap the first point again, or Finish shape, to close the shape. Draw under any object standing on the sidewalk, as if it were not there.",
    obstructions: "Tap every object that obstructs the sidewalk for you, traveling as you normally do. Tap it again to unmark it. Leave the others unmarked, then confirm that they do not obstruct.",
  }),
});

/** The paragraph under a step's heading. `words` is "pointer" or "touch". */
export function annotatorStepParagraph(step, words = "pointer") {
  const copy = ANNOTATOR_STEP_COPY[words] || ANNOTATOR_STEP_COPY.pointer;
  return copy[step] || copy.objects;
}

const NO_SIDEWALK_HINT = "This image is marked as having no sidewalk.";

/**
 * The Sidewalk Outline card's hint for the editor's state: a shape being
 * drawn, a shape selected (`selectedNumber`, as shown on its chip), shapes with
 * none selected, No sidewalk ticked, or nothing yet.
 */
export function sidewalkOutlineHint({ drawing = false, selectedNumber = null, shapeCount = 0, noSidewalk = false } = {}, words = "pointer") {
  const touch = words === "touch";
  if (drawing) {
    return touch
      ? "Tap the first point again, or Finish shape, to close the shape you are drawing."
      : "Click the first point again to close the shape you are drawing.";
  }
  if (selectedNumber != null && selectedNumber !== "") {
    return touch
      ? `Shape ${selectedNumber} is selected. Drag its points on the photo, or tap the dot in the middle of an edge to add a point.`
      : `Shape ${selectedNumber} is selected. Drag its points on the photo, or drag the handle in the middle of an edge to add a point.`;
  }
  if (shapeCount > 0) {
    return touch
      ? "Tap a shape to select it on the photo and adjust its points."
      : "Click a shape to select it on the photo and adjust its points.";
  }
  if (noSidewalk) return NO_SIDEWALK_HINT;
  return touch
    ? "No shapes yet. Tap points around the sidewalk on the photo to start one."
    : "No shapes yet. Click points around the sidewalk on the photo to start one.";
}

/**
 * The one line under the drawing toolbar at the top of the answers sheet, for
 * the editor's state. Shown when the editor has no message of its own.
 */
export function sidewalkSheetHint({ drawing = false, shapeSelected = false } = {}) {
  if (drawing) return "Tap to add points. Drag to place a point with the magnifier. Tap the first point, or Finish, to close.";
  if (shapeSelected) return "Drag a point to move it. Tap a dot in the middle of an edge to add a point.";
  return "Tap the photo to start a shape around the walking space.";
}
