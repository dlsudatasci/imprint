/**
 * The guided tour shown on the first tutorial image (src/pages/contribute/tutorial.jsx).
 *
 * Annotators and contributors share the interface but not the task. Annotators
 * build the ground truth, so they box every object from the 18 categories anywhere
 * in the image, whether or not it is on the sidewalk (Chapter 4, Object Detection
 * Annotation, and the annotation codebook section 4). Contributors verify the
 * model's suggestions. The tour therefore has an annotator version of the first two
 * steps (decided 1 Oct 2026).
 *
 * Annotators give no severity and answer no scene-level questions (decided
 * 3 Oct 2026), so their tour has three steps (canvas, box vs. obstruction,
 * submit) and contributors keep all five. tourTargets() and tourStepCount() give
 * each role's list, so the beacons and the "Step n of N" counter match the steps.
 */
const CONTRIBUTOR_TARGETS = Object.freeze([
  ".rp-stage",
  "#box-review-section",
  "#box-review-section",
  "#scene-level-section",
  "button[type='submit']",
]);

const ANNOTATOR_TARGETS = Object.freeze([
  ".rp-stage",
  "#box-review-section",
  "button[type='submit']",
]);

const CONTRIBUTOR_PLACEMENTS = ["bottom", "top", "top", "top", "top"];
const ANNOTATOR_PLACEMENTS = ["bottom", "top", "top"];

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
  content: "Submit when every suggested box has been decided (Yes, No, or Not an object) and every box, suggested or drawn, has a category and a Yes or No answer. If something is missing, a message tells you what to finish.",
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
    content: "Box every object from the 18 categories that you can see anywhere in the image, whether or not it is on the sidewalk and whether or not it gets in the way. Some images come with dashed yellow suggested boxes: click each one, check its category and change it from the list if it is wrong, choose 'Not an object' if it marks nothing real, and draw a box for anything the suggestions missed.",
  },
  {
    title: "Box vs. Obstruction",
    content: "A box only records that the object is there. For every box, suggested or drawn, answer separately whether it obstructs the sidewalk for you, traveling as you normally do. Objects outside the walking space, such as a car on the road, still get a box and are answered 'No'. Answering 'No' is just as valuable as 'Yes'.",
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
