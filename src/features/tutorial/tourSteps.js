/**
 * The guided tour shown on the first tutorial image (src/pages/contribute/tutorial.jsx).
 *
 * Annotators and contributors share the interface but not the task. Annotators
 * build the ground truth, so they box every object from the 18 categories anywhere
 * in the image, whether or not it is on the sidewalk (Chapter 4, Object Detection
 * Annotation, and the annotation codebook section 4). Contributors verify the
 * model's suggestions. The tour therefore has an annotator version (decided
 * 1 Oct 2026).
 *
 * From 4 Oct 2026 annotators do Step 1 Objects only (boxes and categories, Keep
 * or Not an object on every suggestion), so their tour has four steps (canvas,
 * What to Box, Objects in This Image, submit) and contributors keep all five.
 * tourTargets() and tourStepCount() give each role's list, so the beacons and
 * the "Step n of N" counter match the steps.
 */
const CONTRIBUTOR_TARGETS = Object.freeze([
  ".rp-stage",
  "#box-review-section",
  "#box-review-section",
  "#scene-level-section",
  "button[type='submit']",
]);

// Annotators do Step 1 Objects (4 Oct 2026): canvas, the "What to Box" list,
// the "Objects in This Image" card and Submit
const ANNOTATOR_TARGETS = Object.freeze([
  ".rp-stage",
  "#taxonomy-guide",
  "#box-review-section",
  "button[type='submit']",
]);

const CONTRIBUTOR_PLACEMENTS = ["bottom", "top", "top", "top", "top"];
const ANNOTATOR_PLACEMENTS = ["bottom", "left", "top", "top"];

export function tourTargets(isAnnotator = false) {
  return isAnnotator ? ANNOTATOR_TARGETS : CONTRIBUTOR_TARGETS;
}

export function tourStepCount(isAnnotator = false) {
  return tourTargets(isAnnotator).length;
}

const SEVERITY_STEP = {
  title: "Severity",
  content: "When an object does obstruct, rate how severely it blocks passage on a 1 to 5 scale. A score of 1 means it is a minor inconvenience; 5 means it completely blocks the path.",
};

const SCENE_STEP = {
  title: "Scene-Level Assessment",
  content: "Answer four questions about the sidewalk as a whole: its width, its surface condition, how comfortable it looks for walking, and whether you could personally get along it. If there is no sidewalk, choose None and the other three are skipped.",
};

// The Submit button is never disabled. submit() shows a message naming what is
// still missing instead.
const CONTRIBUTOR_SUBMIT_STEP = {
  title: "Submit",
  content: "Submit when every suggested box has been decided (Yes, No, or Not an object), every box has a category, and all four scene-level questions are answered. If something is missing, a message tells you what to finish.",
};

const ANNOTATOR_SUBMIT_STEP = {
  title: "Submit",
  content: "Move on when every suggested box is kept or marked Not an object and every box has a category. If something is missing, a message tells you what to finish.",
};

const CONTRIBUTOR = [
  {
    title: "Annotation Canvas",
    content: "Dashed yellow boxes are model suggestions. Click each one, check that its label is right (change it from the list if it is not), then decide whether the object obstructs the sidewalk. If a box does not mark a real object, choose 'Not an object' from the list. You can also draw your own boxes by clicking and dragging to label objects the model missed.",
  },
  {
    title: "Box vs. Obstruction",
    content: "Drawing a box records that an object is on or beside the walking space. The obstruction question is separate: for each box, decide whether it blocks the sidewalk for you, traveling as you normally do. Answering 'No' is just as valuable as answering 'Yes'. It tells us the object is there but does not get in the way.",
  },
  SEVERITY_STEP,
  SCENE_STEP,
  CONTRIBUTOR_SUBMIT_STEP,
];

const ANNOTATOR = [
  {
    title: "Annotation Canvas",
    content: "Box every object from the 18 categories that you can see anywhere in the image, on the sidewalk or not. Dashed yellow boxes are suggestions. Click each one, check its category and fix the box if it is loose, then click Keep, or click Not an object if it marks nothing real. Draw a box for every object the suggestions missed.",
  },
  {
    title: "What to Box",
    content: "This list shows the 18 categories and the rules for boxing them. Check it whenever you are unsure whether something needs a box.",
  },
  {
    title: "Objects in This Image",
    content: "This list shows every box in the image and which suggestions you still need to decide. Use Next suggestion to decide to jump to the next one.",
  },
  ANNOTATOR_SUBMIT_STEP,
];

/** The react-joyride steps for this person. */
export function buildTourSteps(isAnnotator = false) {
  const copy = isAnnotator ? ANNOTATOR : CONTRIBUTOR;
  const targets = tourTargets(isAnnotator);
  const placements = isAnnotator ? ANNOTATOR_PLACEMENTS : CONTRIBUTOR_PLACEMENTS;
  return copy.map((step, i) => ({
    target: targets[i],
    title: step.title,
    content: step.content,
    skipBeacon: true,
    overlayClickAction: "none",
    placement: placements[i],
  }));
}
