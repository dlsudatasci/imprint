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
 * (canvas, What Counts as an Obstruction, the list and confirmation, Next
 * Image).
 * Contributors have one tour of five steps. From 7 Oct 2026 its second step,
 * "Your Answers", points at the lists under the photo (Not obstructions and
 * Obstructions), where every answered object is listed.
 *
 * tourTargets(), tourStepCount() and tourBeaconPlacements() take the role and
 * the annotator step, so the beacons and the "Step n of N" counter match the
 * tour on screen.
 *
 * They also take the input (9 Oct 2026): "pointer" (the default, the tours
 * above) or "touch", the tours for the sheet layout on a phone or tablet
 * (tourInputFor). The contributor touch tour has six steps: the photo, Add box,
 * the answers at the bottom of the screen, the severity scale, Step 2 and Next
 * Image. From 12 Oct 2026 annotators have touch tours too (five steps in
 * Objects, five in Sidewalk, four in Obstructions), and the touch tours have
 * no beacons (tourShowsBeacons): the top bar's ? button replays the tour. A
 * touch step whose target is in the part of the sheet pulled down carries
 * `sheet: "full"`, and the tutorial moves the sheet up for it.
 *
 * The wording is chosen apart from the tour (tourWordsFor, 12 Oct 2026). On
 * the desktop layout with a finger as the primary pointer (an iPad held
 * sideways) the pointer tour runs, with its targets and beacons, but a step
 * with `touchContent` uses it: it says "tap", and names Add box where the
 * mouse copy says to draw by dragging, which a finger cannot do. With a mouse
 * every pointer tour reads as before, apart from the last steps of two tours,
 * which named the button Submit where it reads Next Image.
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
  touchContent: "When you answer Yes, a scale opens on the photo beside the box. Rate how severely the object blocks passage, from 1 (a minor inconvenience) to 5 (it completely blocks the path), then tap Confirm. To change it later, open the box and tap Change.",
};

const SCENE_STEP = {
  title: "Scene-Level Assessment",
  content: "Answer four questions about the sidewalk as a whole: its width, its surface condition, how comfortable it looks for walking, and whether you could personally get along it. If there is no sidewalk, choose None and the other three are skipped.",
};

// The submit button reads Next Image, or Finish Session on the last image, and
// is never disabled. submit() shows a message naming what is still missing
// instead. Titled "Submit" until 12 Oct 2026, a name the button never had.
const NEXT_IMAGE_WHEN = "when every suggested box has been decided (Yes, No, or Not an object), every box has a category, and all four scene-level questions are answered. On the last image the button reads Finish Session. If something is missing, a message tells you what to finish.";
const CONTRIBUTOR_SUBMIT_STEP = {
  title: "Next Image",
  content: `Click Next Image ${NEXT_IMAGE_WHEN}`,
  touchContent: `Tap Next Image ${NEXT_IMAGE_WHEN}`,
};

// The tour runs in Objects, so its last step points ahead to Sidewalk and
// Obstructions
const ANNOTATOR_SUBMIT_STEP = {
  title: "Next: Sidewalk",
  content: "When every suggested box is kept or marked Not an object and every box has a category, click Next: Sidewalk. You then outline the walking space, and after that mark which objects obstruct the sidewalk for you. If something is missing, a message tells you what to finish.",
  touchContent: "When every suggested box is kept or marked Not an object and every box has a category, tap Next: Sidewalk. You then outline the walking space, and after that mark which objects obstruct the sidewalk for you. If something is missing, a message tells you what to finish.",
};

const CONTRIBUTOR = [
  {
    title: "Annotation Canvas",
    content: "Dashed yellow boxes are model suggestions. Click each one, check that its label is right (change it from the list if it is not), then decide whether the object obstructs the sidewalk. If a box does not mark a real object, click Not an object. You can also draw your own boxes by clicking and dragging to label objects the model missed.",
    touchContent: "Dashed yellow boxes are model suggestions. Tap each one, check that its label is right (change it from the list if it is not), then decide whether the object obstructs the sidewalk. If a box does not mark a real object, tap Not an object. To label an object the model missed, tap Add box at the bottom left of the photo and drag the new box's corners to fit it. Pinch to zoom in on small objects.",
  },
  {
    title: "Your Answers",
    content: "Every object you answer is listed under the photo, in Not obstructions or Obstructions. Boxes you draw are listed there too. Answering No is just as valuable as answering Yes. It tells us the object is there but does not get in the way. Click any object to change its answer. Click the eye beside an object to hide its box on the photo while you work on boxes around it.",
    touchContent: "Every object you answer is listed under the photo, in Not obstructions or Obstructions. Boxes you add are listed there too. Answering No is just as valuable as answering Yes. It tells us the object is there but does not get in the way. Tap any object to change its answer. Tap the eye beside an object to hide its box on the photo while you work on boxes around it. To show a hidden box again, double-tap where it was.",
  },
  SEVERITY_STEP,
  SCENE_STEP,
  CONTRIBUTOR_SUBMIT_STEP,
];

const ANNOTATOR = [
  {
    title: "Annotation Canvas",
    content: "Box every object from the 18 categories that you can see anywhere in the image, on the sidewalk or not. Dashed yellow boxes are suggestions. Click each one, check its category and fix the box if it is loose, then click Keep, or click Not an object if it marks nothing real. Draw a box for every object the suggestions missed.",
    touchContent: "Box every object from the 18 categories that you can see anywhere in the image, on the sidewalk or not. Dashed yellow boxes are suggestions. Tap each one, check its category and fit the box if it is loose, then tap Keep, or tap Not an object if it marks nothing real. For every object the suggestions missed, tap Add box at the bottom left of the photo and drag the new box's corners to fit it. Pinch to zoom in on small objects.",
  },
  {
    title: "What to Box",
    content: "This list shows the 18 categories and the rules for boxing them. Check it whenever you are unsure whether something needs a box.",
  },
  {
    title: "Objects in This Image",
    content: "This list shows every box in the image and which suggestions you still need to decide. Click a box in the list to select it. Click the eye beside an object to hide its box on the photo while you work on boxes around it.",
    touchContent: "This list shows every box in the image and which suggestions you still need to decide. Tap a box in the list to select it. Tap the eye beside an object to hide its box on the photo while you work on boxes around it. To show a hidden box again, double-tap where it was.",
  },
  ANNOTATOR_SUBMIT_STEP,
];

// Annotators, Sidewalk step (6 Oct 2026). The drawing tools are a bar at the
// top of the photo's card (13 Oct 2026, before that a row above the card), so
// their beacons go to the left of both rather than on top of the bar's buttons
// or under the photo, where the card's beacon is.
const SIDEWALK_TOUR = Object.freeze({
  targets: Object.freeze([".rp-stage", "#sidewalk-tools", "#sidewalk-guide", "#sidewalk-shapes", "button[type='submit']"]),
  placements: ["bottom", "bottom", "left", "top", "top"],
  beacons: ["left", "left", "top", "top", "top"],
  copy: [
    {
      title: "Outline the Walking Space",
      content: "Click points around the sidewalk to outline it, then click the first point again to close the shape. Draw under any object standing on the sidewalk, as if it were not there. Separate stretches, such as both sides of a street, are separate shapes.",
      touchContent: "Tap points around the sidewalk to outline it, then tap the first point again to close the shape. To place a point exactly, drag your finger and let go where the magnifier shows the right spot. Draw under any object standing on the sidewalk, as if it were not there. Separate stretches, such as both sides of a street, are separate shapes.",
    },
    {
      title: "Drawing Tools",
      // The bar shows only the tools that apply (13 Oct 2026, sidewalkTools.js),
      // with the same labels on every device
      content: "These tools change with what you are doing. While you draw a shape, Finish closes it, and Undo and Cancel fix mistakes. Click a finished shape to select it, then drag its points, drag the handle in the middle of an edge to add a point, or use Delete point and Delete shape. Photo only hides the outline's fill so you can check the edges. The object boxes are hidden here and come back in the next step.",
      touchContent: "These tools change with what you are doing. While you draw a shape, Finish closes it, and Undo and Cancel fix mistakes. Tap a finished shape to select it, then drag its points, tap the dot in the middle of an edge to add a point, or use Delete point and Delete shape. Photo only hides the outline's fill so you can check the edges. The object boxes are hidden here and come back in the next step.",
    },
    {
      title: "What Counts as Walking Space",
      content: "This list shows what to include and what to leave out. Check it whenever you are unsure where the sidewalk ends.",
    },
    {
      title: "Sidewalk Outline",
      content: "Every shape you draw is listed here. Click one to select it on the photo and adjust its points, or click its × to delete it. If the image has no sidewalk or pedestrian path, tick No sidewalk instead of drawing.",
      touchContent: "Every shape you draw is listed here. Tap one to select it on the photo and adjust its points, or tap its × to delete it. If the image has no sidewalk or pedestrian path, tick No sidewalk instead of drawing.",
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
      touchContent: "Tap every object that obstructs the sidewalk for you, traveling as you normally do. It turns red. Tap it again to unmark it. The boxes are locked here, so go back to fix a box or a category.",
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
      // The button reads Next Image here, or Finish Session on the last image
      // (titled "Submit" until 12 Oct 2026)
      title: "Next Image",
      content: "Move on when every obstructing object is marked and the box is ticked. On the last image the button reads Finish Session. If something is missing, a message tells you what to finish.",
    },
  ],
});

const CONTRIBUTOR_TOUR = Object.freeze({
  targets: CONTRIBUTOR_TARGETS,
  placements: CONTRIBUTOR_PLACEMENTS,
  beacons: CONTRIBUTOR_BEACONS,
  copy: CONTRIBUTOR,
});

// Contributors on a phone or tablet (9 Oct 2026). The answers sit in a sheet at
// the bottom of the screen, whose top part (#box-review-section-peek) is always
// in view. Step 2 is in the part pulled up: the tutorial moves the sheet up
// before that step, and its beacon sits on the Step 2 line in the sheet's top
// part when there is one (beaconTargets).
const SCENE_SECTION = "#scene-level-section";
const CONTRIBUTOR_TOUCH_TOUR = Object.freeze({
  targets: Object.freeze([
    ".rp-stage",
    "#add-box-button",
    "#box-review-section-peek",
    "#box-review-obstructions-peek",
    SCENE_SECTION,
    "button[type='submit']",
  ]),
  beaconTargets: Object.freeze([
    ".rp-stage",
    "#add-box-button",
    "#box-review-section-peek",
    "#box-review-obstructions-peek",
    `#scene-level-peek, ${SCENE_SECTION}`,
    "button[type='submit']",
  ]),
  // "center": the tooltip in the middle of the screen. The photo fills the
  // screen above the sheet, and a card in the pulled-up sheet fills it too, so
  // a tooltip above or below either would run off the screen with its Next
  // button (found 12 Oct 2026).
  placements: ["center", "top", "top", "top", "center", "top"],
  beacons: ["top", "top", "top", "top", "top", "top"],
  copy: [
    {
      title: "Annotation Canvas",
      content: "Dashed yellow boxes are model suggestions. Tap each one, check that its label is right (change it from the list if it is not), then decide whether the object obstructs the sidewalk. If a box does not mark a real object, tap Not an object. While a box is open it is the only box on the photo, and the others come back when you close it. Pinch to zoom in on small objects.",
    },
    {
      title: "Add a Box",
      content: "To label an object the model missed, tap Add box. A box appears in the middle of the photo. Drag its four corners to fit the object. A magnifier shows exactly where the corner sits. Until you close it, it is the only box on the photo.",
    },
    {
      title: "Your Answers",
      content: "Every answer is listed at the bottom of the screen, in Not obstructions or Obstructions. Boxes you add are listed there too. Answering No is just as valuable as answering Yes. Pull the list up to see everything, and tap any object to change its answer. Hide all and Show all, beside the step's name, hide or bring back every box on the photo, and the eye beside an object in the list pulled up hides one. To show a hidden box again, double-tap where it was.",
    },
    {
      title: "Severity",
      content: "When you answer Yes, a scale opens at the bottom of the screen. Rate how severely the object blocks passage, from 1 (a minor inconvenience) to 5 (it completely blocks the path), then tap Confirm. To change it later, open the box and tap Change.",
    },
    {
      title: "Scene-Level Assessment",
      sheet: "full",
      content: "Pull the list up to answer four questions about the sidewalk as a whole: its width, its surface condition, how comfortable it looks for walking, and whether you could personally get along it. If there is no sidewalk, choose None and the other three are skipped.",
    },
    {
      title: "Next Image",
      content: `Tap Next Image ${NEXT_IMAGE_WHEN}`,
    },
  ],
});

// Annotators on a phone or tablet (12 Oct 2026). Their cards are in the answers
// sheet: the top part (#box-review-section-peek, #sidewalk-tools) is always in
// view, and the cards below it are in the part pulled up (sheet: "full").
const TOP = (n) => Array.from({ length: n }, () => "top");
const ANNOTATOR_TOUCH_TOURS = Object.freeze({
  objects: Object.freeze({
    targets: Object.freeze([".rp-stage", "#add-box-button", "#box-review-section-peek", "#taxonomy-guide", "button[type='submit']"]),
    placements: ["center", "top", "top", "center", "top"],
    beacons: TOP(5),
    copy: [
      {
        title: "Annotation Canvas",
        content: "Box every object from the 18 categories that you can see anywhere in the image, on the sidewalk or not. Tap each dashed yellow suggestion, check its category and fit the box if it is loose, then tap Keep, or tap Not an object if it marks nothing real. While a box is open it is the only box on the photo, and the others come back when you close it. Pinch to zoom in on small objects.",
      },
      {
        title: "Add a Box",
        content: "Tap Add box for every object the suggestions missed. A box appears in the middle of the photo. Drag its four corners to fit the object. A magnifier shows exactly where the corner sits. Until you close it, it is the only box on the photo.",
      },
      {
        title: "Objects in This Image",
        content: "Every box is listed at the bottom of the screen, with what is left first: the suggestions still to decide and the boxes with no category yet. Tap one to open it, or tap Next to go to the next one left. Hide all and Show all, beside the step's name, hide or bring back every box on the photo, and the eye in the list pulled up hides one. To show a hidden box again, double-tap where it was.",
      },
      {
        title: "What to Box",
        sheet: "full",
        content: "This list shows the 18 categories and the rules for boxing them. Pull the sheet up to check it whenever you are unsure whether something needs a box.",
      },
      {
        title: "Next: Sidewalk",
        content: "When every suggested box is kept or marked Not an object and every box has a category, tap Next. You then outline the walking space, and after that mark which objects obstruct the sidewalk for you. If something is missing, a message tells you what to finish.",
      },
    ],
  }),
  sidewalk: Object.freeze({
    targets: Object.freeze([".rp-stage", "#sidewalk-tools", "#sidewalk-shapes", "#sidewalk-guide", "button[type='submit']"]),
    placements: ["center", "top", "center", "center", "top"],
    beacons: TOP(5),
    copy: [
      {
        title: "Outline the Walking Space",
        content: "Tap points around the sidewalk, then tap the first point again to close the shape. To place a point exactly, drag your finger and let go where the magnifier shows the right spot. Draw under any object standing on the sidewalk, as if it were not there. Separate stretches are separate shapes.",
      },
      {
        title: "Drawing Tools",
        content: "These tools change with what you are doing. While you draw a shape, Finish closes it, and Undo and Cancel fix mistakes. Tap a finished shape to select it, then drag its points, tap a dot in the middle of an edge to add a point, or use Delete point and Delete shape. Photo only hides the fill so you can check the edges.",
      },
      {
        title: "Sidewalk Outline",
        sheet: "full",
        content: "Every shape you draw is listed here. Tap one to select it on the photo. If the image has no sidewalk or pedestrian path, tick No sidewalk instead of drawing.",
      },
      {
        title: "What Counts as Walking Space",
        sheet: "full",
        content: "This list shows what to include and what to leave out. Check it whenever you are unsure where the sidewalk ends.",
      },
      {
        title: "Next: Obstructions",
        content: "Move on when the walking space is outlined, or No sidewalk is ticked, and no shape is half drawn. If something is missing, a message tells you what to finish.",
      },
    ],
  }),
  obstructions: Object.freeze({
    targets: Object.freeze([".rp-stage", "#box-review-section-peek", "#obstruction-guide", "button[type='submit']"]),
    placements: ["center", "top", "center", "top"],
    beacons: TOP(4),
    copy: [
      {
        title: "Mark the Obstructions",
        content: "Tap every object that obstructs the sidewalk for you, traveling as you normally do. It turns red. Tap it again to unmark it. The boxes are locked here, so go back to fix a box or a category.",
      },
      {
        title: "Which of These Obstruct",
        content: "You can also mark objects from the list at the bottom of the screen. When you have checked every object, tick the box to confirm that the ones you did not mark do not obstruct the sidewalk for you.",
      },
      {
        title: "What Counts as an Obstruction",
        sheet: "full",
        content: "This list explains when an object obstructs. Judge for yourself, not for an average pedestrian.",
      },
      {
        title: "Next Image",
        content: "Move on when every obstructing object is marked and the box is ticked. On the last image the button reads Finish Session. If something is missing, a message tells you what to finish.",
      },
    ],
  }),
});

/** Added to the first step of every touch tour on a phone (not a tablet). */
export const PHONE_FULL_SCREEN_SENTENCE = "On a phone, the button at the bottom right of the photo shows the photo full screen, which you can also use with the phone held sideways.";
/** Added to the first step of every touch tour on a tablet (12 Oct 2026). */
export const TABLET_FULL_SCREEN_SENTENCE = "The button at the bottom right of the photo shows the photo full screen.";

const ANNOTATOR_TOURS = Object.freeze({
  objects: Object.freeze({ targets: ANNOTATOR_TARGETS, placements: ANNOTATOR_PLACEMENTS, beacons: ANNOTATOR_BEACONS, copy: ANNOTATOR }),
  sidewalk: SIDEWALK_TOUR,
  obstructions: OBSTRUCTIONS_TOUR,
});

/**
 * The tour for this person, annotator step and input. Contributors have one
 * tour whatever the step, and a touch version of it. An unknown step falls
 * back to the Objects tour.
 */
function tourFor(isAnnotator, step, input = "pointer") {
  if (!isAnnotator) return input === "touch" ? CONTRIBUTOR_TOUCH_TOUR : CONTRIBUTOR_TOUR;
  const tours = input === "touch" ? ANNOTATOR_TOUCH_TOURS : ANNOTATOR_TOURS;
  return tours[step] || tours.objects;
}

/**
 * Which tour a layout gets: the touch tours point at the answers sheet, which
 * only the sheet layout has. The desktop layout keeps the pointer tour, with
 * its targets and beacons, on every device (12 Oct 2026). Before, an iPad held
 * sideways got the touch tour, whose targets were not on that screen.
 */
export function tourInputFor(layout) {
  return layout === "sheet" ? "touch" : "pointer";
}

/**
 * Which wording a tour uses: "touch" ("tap", Add box) on the sheet layout, and
 * on the desktop layout when a finger is the primary pointer. Phones and
 * tablets always have the sheet layout (12 Oct 2026, useAnnotateLayout), so
 * the second case is only a guard for a device that changes its pointer after
 * the page loaded. A laptop with a touch screen has a mouse or trackpad as its
 * primary pointer, so it keeps "pointer" ("click").
 */
export function tourWordsFor({ layout, coarsePointer } = {}) {
  return layout === "sheet" || coarsePointer === true ? "touch" : "pointer";
}

/**
 * The touch tours have no beacons (12 Oct 2026): on a phone they sat over the
 * photo and the sheet and blocked swipes and drags. The top bar's ? button
 * replays the tour instead.
 */
export function tourShowsBeacons(input = "pointer") {
  return input !== "touch";
}

export function tourTargets(isAnnotator = false, step = "objects", input = "pointer") {
  return tourFor(isAnnotator, step, input).targets;
}

/**
 * What each step's beacon is measured against: the step's target, or for the
 * touch tour's Step 2 the Step 2 line at the top of the sheet when there is
 * one, since the section itself is in the part of the sheet pulled down.
 */
export function tourBeaconTargets(isAnnotator = false, step = "objects", input = "pointer") {
  const tour = tourFor(isAnnotator, step, input);
  return tour.beaconTargets || tour.targets;
}

export function tourStepCount(isAnnotator = false, step = "objects", input = "pointer") {
  return tourTargets(isAnnotator, step, input).length;
}

/** Where each step's beacon sits against its target: "top", "bottom" or "left". */
export function tourBeaconPlacements(isAnnotator = false, step = "objects", input = "pointer") {
  return [...tourFor(isAnnotator, step, input).beacons];
}

/**
 * The react-joyride steps for this person, annotator step and input.
 *
 * `options.words` ("pointer" by default) picks the wording of a pointer tour:
 * with "touch", a step that has `touchContent` uses it. The touch tours ignore
 * it. `options.phone` adds the full-screen sentence to the first step of a
 * touch tour, and `options.tablet` adds the tablet's. Never on a pointer tour:
 * phones and tablets always have the sheet layout, so the touch tours. A touch step in the part of the sheet pulled down keeps its
 * `sheet: "full"`, for the tutorial page to move the sheet.
 */
export function buildTourSteps(isAnnotator = false, step = "objects", input = "pointer", { words = "pointer", phone = false, tablet = false } = {}) {
  const { copy, targets, placements } = tourFor(isAnnotator, step, input);
  const touchWords = input === "pointer" && words === "touch";
  return copy.map((entry, i) => {
    let content = touchWords && entry.touchContent ? entry.touchContent : entry.content;
    if (input === "touch" && phone && i === 0) content = `${content} ${PHONE_FULL_SCREEN_SENTENCE}`;
    else if (input === "touch" && tablet && i === 0) content = `${content} ${TABLET_FULL_SCREEN_SENTENCE}`;
    return {
      target: targets[i],
      title: entry.title,
      content,
      skipBeacon: true,
      overlayClickAction: "none",
      placement: placements[i],
      // On the phone screen nothing but the sheet's own list may scroll, and
      // the tutorial page moves that itself. The tour library's scrolling
      // shifted the whole screen (12 Oct 2026).
      ...(input === "touch" ? { skipScroll: true } : {}),
      ...(entry.sheet ? { sheet: entry.sheet } : {}),
    };
  });
}
