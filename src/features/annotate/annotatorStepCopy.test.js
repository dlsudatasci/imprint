import { describe, it, expect } from "vitest";
import { ANNOTATOR_STEP_COPY, annotatorStepParagraph, sidewalkOutlineHint, sidewalkSheetHint } from "./annotatorStepCopy";

/** The annotator steps' wording with a mouse and with a finger (12 Oct 2026). */
const HINT_STATES = [
  { drawing: true },
  { selectedNumber: "2", shapeCount: 3 },
  { shapeCount: 2 },
  { noSidewalk: true },
  {},
];

describe("annotatorStepParagraph", () => {
  it("keeps the desktop paragraphs word for word", () => {
    expect(annotatorStepParagraph("objects")).toBe("Box every object from the 18 categories that you can see anywhere in the image, on the sidewalk or not. For each dashed yellow suggestion, check its category, fix the box if it is loose, then click Keep, or click Not an object if it marks nothing real. Draw a box for every object the suggestions missed.");
    expect(annotatorStepParagraph("sidewalk")).toBe("Outline the walking space in this image. Click points around the sidewalk and click the first point again to close the shape. Draw under any object standing on the sidewalk, as if it were not there.");
    expect(annotatorStepParagraph("obstructions")).toBe("Click every object that obstructs the sidewalk for you, traveling as you normally do. Click it again to unmark it. Leave the others unmarked, then confirm below that they do not obstruct.");
    expect(annotatorStepParagraph("objects", "pointer")).toBe(annotatorStepParagraph("objects"));
  });

  it("says tap, never click, with a finger, and names Add box and Finish shape", () => {
    expect(annotatorStepParagraph("objects", "touch")).toBe("Box every object from the 18 categories that you can see anywhere in the image, on the sidewalk or not. For each dashed yellow suggestion, check its category, fit the box if it is loose, then tap Keep, or tap Not an object if it marks nothing real. Tap Add box for every object the suggestions missed.");
    expect(annotatorStepParagraph("sidewalk", "touch")).toBe("Outline the walking space in this image. Tap points around the sidewalk, then tap the first point again, or Finish shape, to close the shape. Draw under any object standing on the sidewalk, as if it were not there.");
    expect(annotatorStepParagraph("obstructions", "touch")).toBe("Tap every object that obstructs the sidewalk for you, traveling as you normally do. Tap it again to unmark it. Leave the others unmarked, then confirm that they do not obstruct.");
    for (const text of Object.values(ANNOTATOR_STEP_COPY.touch)) {
      expect(text).toMatch(/\btap\b/i);
      expect(text).not.toMatch(/click/i);
    }
  });

  it("has no em dash or semicolon in either version", () => {
    for (const words of ["pointer", "touch"]) {
      for (const text of Object.values(ANNOTATOR_STEP_COPY[words])) expect(text).not.toMatch(/[—;]/);
    }
  });
});

describe("sidewalkOutlineHint", () => {
  it("keeps the desktop hints word for word", () => {
    expect(HINT_STATES.map((state) => sidewalkOutlineHint(state))).toEqual([
      "Click the first point again to close the shape you are drawing.",
      "Shape 2 is selected. Drag its points on the photo, or drag the handle in the middle of an edge to add a point.",
      "Click a shape to select it on the photo and adjust its points.",
      "This image is marked as having no sidewalk.",
      "No shapes yet. Click points around the sidewalk on the photo to start one.",
    ]);
  });

  it("says tap with a finger, and leaves the No sidewalk line as it is", () => {
    expect(HINT_STATES.map((state) => sidewalkOutlineHint(state, "touch"))).toEqual([
      "Tap the first point again, or Finish shape, to close the shape you are drawing.",
      "Shape 2 is selected. Drag its points on the photo, or tap the dot in the middle of an edge to add a point.",
      "Tap a shape to select it on the photo and adjust its points.",
      "This image is marked as having no sidewalk.",
      "No shapes yet. Tap points around the sidewalk on the photo to start one.",
    ]);
    for (const state of HINT_STATES) {
      expect(sidewalkOutlineHint(state, "touch")).not.toMatch(/click/i);
      expect(sidewalkOutlineHint(state, "touch")).not.toMatch(/[—;]/);
    }
  });
});

describe("sidewalkSheetHint", () => {
  it("gives one line for each state at the top of the sheet, with tap and no click", () => {
    const lines = [sidewalkSheetHint({ drawing: true }), sidewalkSheetHint({ shapeSelected: true }), sidewalkSheetHint()];
    expect(lines).toEqual([
      "Tap to add points. Drag to place a point with the magnifier. Tap the first point, or Finish, to close.",
      "Drag a point to move it. Tap a dot in the middle of an edge to add a point.",
      "Tap the photo to start a shape around the walking space.",
    ]);
    for (const line of lines) expect(line).not.toMatch(/click|[—;]/i);
  });
});
