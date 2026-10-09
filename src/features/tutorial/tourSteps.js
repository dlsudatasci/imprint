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
 * Annotators do three steps on a model-development image (6 Oct 2026): Objects
 * (boxes and categories, Keep or Not an object on every suggestion), Sidewalk
 * (outline the walking space), then Obstructions (mark the obstructing objects,
 * confirm the rest). Reference images skip Sidewalk. The tutorial always shows
 * all three, and each has its own tour (Sidewalk and Obstructions from 6 Oct
 * 2026): four steps in Objects (canvas, What to Box, Objects in This Image,
 * Next: Sidewalk), five in Sidewalk (canvas, drawing tools, What Counts as
 * Walking Space, Sidewalk Outline, Next: Obstructions) and four in Obstructions
 * (canvas, What Counts as an Obstruction, the list and confirmation, Submit).
 * Contributors have one tour of five steps. From 7 Oct 2026 its second step,
 * "Your Answers", points at the lists under the photo (Not obstructions and
 * Obstructions), where every answered object is listed.
 *
 * tourTargets(), tourStepCount() and tourBeaconPlacements() take the role and
 * the annotator step, so the beacons and the "Step n of N" counter match the
 * tour on screen.
 */
// The severity step points at the photo (8 Oct 2026): the severity scale opens
// on the photo beside the box after a Yes, not in the lists under it
const CONTRIBUTOR_TARGETS = Object.freeze([
  ".rp-stage",
  "#box-review-section",
  ".rp-stage",
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

const CONTRIBUTOR_PLACEMENTS = ["bottom", "top", "bottom", "top", "top"];
const ANNOTATOR_PLACEMENTS = ["bottom", "left", "top", "top"];

// Where each step's pulsing beacon sits against its target: above it, below
// it, or to its left. When two steps share a target (the contributor canvas and
// severity steps, both on the photo) the second beacon sits beside the photo's
// left edge, level with its middle, as the Sidewalk tour's photo beacon does.
const CONTRIBUTOR_BEACONS = ["top", "top", "left", "top", "top"];
const ANNOTATOR_BEACONS = ["top", "top", "top", "top"];

const SEVERITY_STEP = {
  title: "Severity",
  content: "When you answer Yes, a scale opens on the photo beside the box. Rate how severely the object blocks passage, from 1 (a minor inconvenience) to 5 (it completely blocks the path), then click Confirm. To change it later, open the box and click Change.",
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

// The tour runs in Objects, so its last step points ahead to Sidewalk and
// Obstructions
const ANNOTATOR_SUBMIT_STEP = {
  title: "Next: Sidewalk",
  content: "When every suggested box is kept or marked Not an object and every box has a category, click Next: Sidewalk. You then outline the walking space, and after that mark which objects obstruct the sidewalk for you. If something is missing, a message tells you what to finish.",
};

const CONTRIBUTOR = [
  {
    title: "Annotation Canvas",
    content: "Dashed yellow boxes are model suggestions. Click each one, check that its label is right (change it from the list if it is not), then decide whether the object obstructs the sidewalk. If a box does not mark a real object, click Not an object. You can also draw your own boxes by clicking and dragging to label objects the model missed.",
  },
  {
    title: "Your Answers",
    content: "Every object you answer is listed under the photo, in Not obstructions or Obstructions. Boxes you draw are listed there too. Answering No is just as valuable as answering Yes. It tells us the object is there but does not get in the way. Click any object to change its answer. Click the eye beside an object to hide its box on the photo while you work on boxes around it.",
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
    content: "This list shows every box in the image and which suggestions you still need to decide. Click a box in the list to select it. Click the eye beside an object to hide its box on the photo while you work on boxes around it.",
  },
  ANNOTATOR_SUBMIT_STEP,
];

// Annotators, Sidewalk step (6 Oct 2026). The toolbar sits right above the
// photo, so their beacons go to the left of both rather than on top of the
// toolbar's buttons or under the photo, where the card's beacon is.
const SIDEWALK_TOUR = Object.freeze({
  targets: Object.freeze([".rp-stage", "#sidewalk-tools", "#sidewalk-guide", "#sidewalk-shapes", "button[type='submit']"]),
  placements: ["bottom", "bottom", "left", "top", "top"],
  beacons: ["left", "left", "top", "top", "top"],
  copy: [
    {
      title: "Outline the Walking Space",
      content: "Click points around the sidewalk to outline it, then click the first point again to close the shape. Draw under any object standing on the sidewalk, as if it were not there. Separate stretches, such as both sides of a street, are separate shapes.",
    },
    {
      title: "Drawing Tools",
      content: "Finish shape closes the shape you are drawing, and Undo point and Cancel shape fix mistakes. Click a finished shape to select it, then drag its points, drag the handle in the middle of an edge to add a point, or delete a point or the whole shape. Show object boxes and Show photo only help you check the edges.",
    },
    {
      title: "What Counts as Walking Space",
      content: "This list shows what to include and what to leave out. Check it whenever you are unsure where the sidewalk ends.",
    },
    {
      title: "Sidewalk Outline",
      content: "Every shape you draw is listed here. Click one to select it on the photo and adjust its points, or click its × to delete it. If the image has no sidewalk or pedestrian path, tick No sidewalk instead of drawing.",
    },
    {
      title: "Next: Obstructions",
      content: "Move on when the walking space is outlined, or No sidewalk is ticked, and no shape is half drawn. If something is missing, a message tells you what to finish.",
    },
  ],
});

// Annotators, Obstructions step (6 Oct 2026)
const OBSTRUCTIONS_TOUR = Object.freeze({
  targets: Object.freeze([".rp-stage", "#obstruction-guide", "#box-review-section", "button[type='submit']"]),
  placements: ["bottom", "left", "top", "top"],
  beacons: ["top", "top", "top", "top"],
  copy: [
    {
      title: "Mark the Obstructions",
      content: "Click every object that obstructs the sidewalk for you, traveling as you normally do. It turns red. Click it again to unmark it. The boxes are locked here, so go back to fix a box or a category.",
    },
    {
      title: "What Counts as an Obstruction",
      content: "This list explains when an object obstructs. Judge for yourself, not for an average pedestrian.",
    },
    {
      title: "Which of These Obstruct",
      content: "You can also mark objects with the buttons in this list. When you have checked every object, tick the box to confirm that the ones you did not mark do not obstruct the sidewalk for you.",
    },
    {
      title: "Submit",
      content: "Move on when every obstructing object is marked and the box is ticked. If something is missing, a message tells you what to finish.",
    },
  ],
});

const CONTRIBUTOR_TOUR = Object.freeze({
  targets: CONTRIBUTOR_TARGETS,
  placements: CONTRIBUTOR_PLACEMENTS,
  beacons: CONTRIBUTOR_BEACONS,
  copy: CONTRIBUTOR,
});

const ANNOTATOR_TOURS = Object.freeze({
  objects: Object.freeze({ targets: ANNOTATOR_TARGETS, placements: ANNOTATOR_PLACEMENTS, beacons: ANNOTATOR_BEACONS, copy: ANNOTATOR }),
  sidewalk: SIDEWALK_TOUR,
  obstructions: OBSTRUCTIONS_TOUR,
});

/**
 * The tour for this person and annotator step. Contributors have one tour
 * whatever the step. An unknown step falls back to the Objects tour.
 */
function tourFor(isAnnotator, step) {
  if (!isAnnotator) return CONTRIBUTOR_TOUR;
  return ANNOTATOR_TOURS[step] || ANNOTATOR_TOURS.objects;
}

export function tourTargets(isAnnotator = false, step = "objects") {
  return tourFor(isAnnotator, step).targets;
}

export function tourStepCount(isAnnotator = false, step = "objects") {
  return tourTargets(isAnnotator, step).length;
}

/** Where each step's beacon sits against its target: "top", "bottom" or "left". */
export function tourBeaconPlacements(isAnnotator = false, step = "objects") {
  return [...tourFor(isAnnotator, step).beacons];
}

/** The react-joyride steps for this person and annotator step. */
export function buildTourSteps(isAnnotator = false, step = "objects") {
  const { copy, targets, placements } = tourFor(isAnnotator, step);
  return copy.map((entry, i) => ({
    target: targets[i],
    title: entry.title,
    content: entry.content,
    skipBeacon: true,
    overlayClickAction: "none",
    placement: placements[i],
  }));
}
