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
 * Contributors have one tour. From 3 Nov 2026 (S16, after the first two pilot
 * sessions found the tutorial harder than the task) it has six steps, each
 * short, most with a numbered list: Check Each Box (where the object is, then
 * whether it obstructs, without the question numbers from S18, and that a
 * dashed box is only a suggestion), What Counts as the Path (the
 * sidewalk nearest you only), Your Answers, Severity, Scene-Level Assessment
 * (the same nearest sidewalk) and Next Image. The wording is Rans's (S16b, the
 * same day): Your Answers and Next Image have no list, and Severity no intro.
 * After Rans's review of S16b (the same day) Check Each Box has no line on the
 * dashed boxes, Your Answers names Hide all and Show all, and Next Image is
 * two sentences, without Finish Session. From Rans's review of S18 (5 Nov
 * 2026) Your Answers is its first sentence only and Severity one paragraph
 * with no list.
 * A contributor step has `intro`, `points` (possibly none), `after` (text
 * after the list) and `note`, with `touchIntro`, `touchPoints`, `touchAfter`
 * and `touchNote` where the touch wording differs. buildTourSteps returns
 * them, and `content` as the same text joined into plain sentences, and the
 * tutorial page builds the list. Each step stays within CONTRIBUTOR_BUDGET
 * (tourSteps.test.js checks). Check Each Box sits right of the photo (S16b).
 * The question's wording and the path's lines come from
 * sidewalkQuestionCopy.js, the one place they are spelled out.
 *
 * tourTargets() and tourStepCount() take the role and the annotator step, so
 * the "Step n of N" counter matches the tour on screen. No tour has beacons
 * (the laptop's went on 3 Nov 2026, S16b): a ? button runs the tour again, in
 * the top bar on a phone and in the progress strip on a laptop.
 *
 * They also take the input (9 Oct 2026): "pointer" (the default, the tours
 * above) or "touch", the tours for the sheet layout on a phone or tablet
 * (tourInputFor). The contributor touch tour has seven steps (S16): the
 * photo, the path, Add box, the answers in the sheet pulled up (S16b), the
 * severity scale, Step 2 and Next Image. From 12 Oct 2026 annotators have
 * touch tours too (five steps in Objects, five in Sidewalk, four in
 * Obstructions). A touch step whose target is in the part of the sheet pulled
 * down carries `sheet: "full"`, and the tutorial moves the sheet up for it.
 *
 * The wording is chosen apart from the tour (tourWordsFor, 12 Oct 2026). On
 * the desktop layout with a finger as the primary pointer (an iPad held
 * sideways) the pointer tour runs, with its targets, but a step
 * with `touchContent` uses it: it says "tap", and names Add box where the
 * mouse copy says to draw by dragging, which a finger cannot do. With a mouse
 * every pointer tour reads as before, apart from the last steps of two tours,
 * which named the button Submit where it reads Next Image.
 */
import { SIDEWALK_QUESTION_COPY } from "@/features/annotate/sidewalkQuestionCopy";
import { PROPOSAL_HINT_COPY } from "@/util/modelProposal";

/**
 * The most a contributor step may say (S16): the intro, the points, `after`
 * and the note together, the question's text counted, and one point on its own.
 * The sentence on the model's proposal (`pointNote`, S3) is not counted: it is
 * required wording, and Check Each Box keeps Rans's own words beside it
 * (decided 6 Nov 2026). The laptop zoom line (`zoomNote`, S28, 13 Nov 2026)
 * is counted: Check Each Box is 74 words with it.
 */
export const CONTRIBUTOR_BUDGET = Object.freeze({ words: 80, points: 5, wordsPerPoint: 18 });

/**
 * The laptop's zoom (S28, 13 Nov 2026), a second muted line on Check Each Box
 * after its note, on the laptop tour worded for a mouse only. The minus is a
 * real minus, as the Zoom out button's line. A finger keeps "Pinch to zoom in
 * on small objects." on the touch tour.
 */
export const DESKTOP_ZOOM_NOTE = "Use + and \u2212 at the top right of the photo to zoom in. Scroll to move around.";

// The severity step points at the photo (8 Oct 2026): the severity scale opens
// on the photo beside the box after a Yes, not in the lists under it. The
// path step (S16) pointed at Step 1's instructions above the photo until
// 5 Nov 2026, when Rans found that confusing: it points at the photo, as
// Check Each Box does, with its card on the photo's right.
// S15 (9 Nov 2026): Step 1 first, the card asking whether there is a
// sidewalk, above the photo.
const PRESENCE_SECTION = "#sidewalk-presence-section";
const CONTRIBUTOR_TARGETS = Object.freeze([
  PRESENCE_SECTION,
  ".rp-stage",
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

// Check Each Box to the right of the photo (S16b): below it, the card could not
// be read without scrolling. Where there is no room on the right it slides over
// the photo's right side (CHECK_FLOATING), never below the photo.
// Step 3 (S22, 9 Nov 2026): left of the section, its top level with the
// section's top. Above it, the card ran off the top of a laptop's screen.
const CONTRIBUTOR_PLACEMENTS = ["bottom", "right", "right", "top", "bottom", "left-start", "top"];
const ANNOTATOR_PLACEMENTS = ["bottom", "left", "top", "top"];

// ---- Contributors (S16, 3 Nov 2026): short numbered steps ----
// The wording from S16b (3 Nov 2026) is Rans's, after his review of S16.

// S18 (4 Nov 2026): the two questions by what they ask, not by number. The
// box panel's "Question 1 of 2" labels number them. Rans's wording (5 Nov
// 2026): both questions as instructions, and Not an object spelled out.
const checkPoints = (verb) => [
  `${verb} a box and check its label.`,
  SIDEWALK_QUESTION_COPY.answerWhether,
  "Then, answer whether it obstructs the sidewalk or the path for you.",
  `If it's not a real object, ${verb.toLowerCase()} Not an object.`,
];
/**
 * The sentence on the model's proposal (S3, 6 Nov 2026), right after the
 * third point's text, the obstruction question, in the same style (Rans).
 * `after` is the point it follows, counted from 1. Said whether or not
 * proposals are loaded yet, so the tour does not change on the day they are.
 */
const PROPOSAL_POINT_NOTE = Object.freeze({ after: 3, text: PROPOSAL_HINT_COPY.tutorial });
/**
 * Check Each Box sits right of the photo, and never runs off the screen: no
 * flip to below the photo, and a slide left over the photo where there is no
 * room on the right, as well as up or down into the screen.
 */
const CHECK_FLOATING = Object.freeze({ flipOptions: false, shiftOptions: { crossAxis: true } });

// Step 1 (S15, 9 Nov 2026): whether there is a sidewalk, before the objects.
// The path's own rule is taught here in words, as every tutorial photo has a sidewalk.
const PRESENCE_STEP = {
  title: "Is There a Sidewalk?",
  intro: "First, say whether the photo has a sidewalk raised on a curb, or only a path for people to walk on.",
  points: ["With only a path, each object asks only whether it obstructs it."],
};

const PATH_STEP = {
  title: "What Counts as the Path",
  points: SIDEWALK_QUESTION_COPY.pathPoints,
};

// One paragraph, no list (Rans, 5 Nov 2026). A confirmed obstruction opens on
// its scale (S17), so the scale is how it is changed.
const SEVERITY_STEP = {
  title: "Severity",
  intro: "Rate how much it blocks you, from 1 to 5. You can still change this later by opening the box and adjusting the scale.",
};

// Rated on the same sidewalk as Question 1, so a photo with two sidewalks is
// rated on one (Rans, 3 Nov 2026). From S15 (9 Nov 2026) the six questions
// of Step 3, two of them for a path.
const SCENE_STEP = {
  title: "Scene-Level Assessment",
  intro: "Then rate the sidewalk nearest you as a whole:",
  points: [
    "Its width as built",
    "How easy it is to get through, from unobstructed to fully obstructed",
    "Whether it tilts sideways",
    "What its surface is made of, and whether it is cracked or broken",
    "Whether anything stands between it and the road",
  ],
  note: "With only a path, you answer just the second and third.",
};

// The submit button reads Next Image, or Finish Session on the last image, and
// is never disabled. submit() shows a message naming what is still missing
// instead. Titled "Submit" until 12 Oct 2026, a name the button never had.
const nextImageAfter = (verb) => `${verb} Next Image once every box has an answer. If something is missing, a warning will appear to point it out.`;
const CONTRIBUTOR_SUBMIT_STEP = {
  title: "Next Image",
  after: nextImageAfter("Click"),
  touchAfter: nextImageAfter("Tap"),
};

// The tour runs in Objects, so its last step points ahead to Sidewalk and
// Obstructions
const ANNOTATOR_SUBMIT_STEP = {
  title: "Next: Sidewalk",
  content: "When every suggested box is kept or marked Not an object and every box has a category, click Next: Sidewalk. You then outline the walking space, and after that mark which objects obstruct the sidewalk for you. If something is missing, a message tells you what to finish.",
  touchContent: "When every suggested box is kept or marked Not an object and every box has a category, tap Next: Sidewalk. You then outline the walking space, and after that mark which objects obstruct the sidewalk for you. If something is missing, a message tells you what to finish.",
};

const CONTRIBUTOR = [
  PRESENCE_STEP,
  {
    title: "Check Each Box",
    points: checkPoints("Click"),
    touchPoints: checkPoints("Tap"),
    pointNote: PROPOSAL_POINT_NOTE,
    // We missed it, not the contributor (Rans, 5 Nov 2026)
    // Any object on the path we missed, obstructing or not (Rans, 5 Nov 2026)
    note: "Did we miss an object on the sidewalk or path? Click and drag to box it, even if it doesn't obstruct.",
    touchNote: "Did we miss an object on the sidewalk or path? Tap Add box to box it, even if it doesn't obstruct.",
    zoomNote: DESKTOP_ZOOM_NOTE,
    floatingOptions: CHECK_FLOATING,
  },
  // On the photo's right, as Check Each Box (5 Nov 2026)
  { ...PATH_STEP, floatingOptions: CHECK_FLOATING },
  {
    // The lines on the names, the eye, Hide all and Show all went (Rans, 5 Nov 2026)
    title: "Your Answers",
    intro: "Every answer goes into a list under the photo.",
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
// top of the photo's card (13 Oct 2026, before that a row above the card).
const SIDEWALK_TOUR = Object.freeze({
  targets: Object.freeze([".rp-stage", "#sidewalk-tools", "#sidewalk-guide", "#sidewalk-shapes", "button[type='submit']"]),
  placements: ["bottom", "bottom", "left", "top", "top"],
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
  copy: CONTRIBUTOR,
});

// Contributors on a phone or tablet (9 Oct 2026). The answers sit in a sheet at
// the bottom of the screen, whose top part (#box-review-section-peek) is always
// in view. Step 2 is in the part pulled up: the tutorial moves the sheet up
// before that step. Seven steps from 3 Nov 2026 (S16), in the same short
// format as the pointer tour, with the path step second. Eight from S15
// (9 Nov 2026), Step 1 first, at the top of the sheet.
//
// Your Answers (S16b) pulls the sheet up and highlights the lists there, from
// their Still to decide line down to the Obstructions card. Its target is
// #box-review-lists, which holds exactly those, with no padding: the whole
// lists block (#box-review-section) has padding under the Obstructions card,
// and with the highlight's own margin it ran into the Step 2 heading (Rans,
// 3 Nov 2026).
const SCENE_SECTION = "#scene-level-section";
const CONTRIBUTOR_TOUCH_TOUR = Object.freeze({
  targets: Object.freeze([
    // Step 1 (S15), at the top of the sheet
    PRESENCE_SECTION,
    ".rp-stage",
    ".rp-stage",
    "#add-box-button",
    "#box-review-lists",
    "#box-review-chips-peek",
    SCENE_SECTION,
    "button[type='submit']",
  ]),
  // "center": the tooltip in the middle of the screen. The photo fills the
  // screen above the sheet, and a card in the pulled-up sheet fills it too, so
  // a tooltip above or below either would run off the screen with its Next
  // button (found 12 Oct 2026). A centred step has no highlight, so Add a Box
  // and Your Answers point at their targets (S16b): their cards slide up or
  // down into the screen (buildTourSteps) and are no taller than the room
  // beside the target (the tutorial page's fitBesideTarget).
  placements: ["bottom", "center", "center", "top", "top", "top", "center", "top"],
  copy: [
    PRESENCE_STEP,
    {
      title: "Check Each Box",
      points: checkPoints("Tap"),
      // As on the laptop tour (S3)
      pointNote: PROPOSAL_POINT_NOTE,
    },
    PATH_STEP,
    {
      title: "Add a Box",
      points: [
        // Which objects to add, obstructing or not (Rans, 5 Nov 2026), its own point to stay within 18 words
        "Tap Add box for any object on the sidewalk or path we missed, even if it doesn't obstruct.",
        "A box appears in the middle of the photo.",
        "Drag its four corners to fit the object. A magnifier shows where each corner sits.",
        "Pick its category and answer both questions.",
      ],
      note: "Pinch to zoom in on small objects.",
      fitBesideTarget: true,
    },
    {
      title: "Your Answers",
      sheet: "full",
      intro: "Every object is listed at the bottom of the screen.",
      after: "Pull the list up to see them all.",
      fitBesideTarget: true,
      // The lists are in the sheet's scrolling part, and the library keeps a
      // card inside its target's scrolling parent: that put the card over the
      // lists, under the part's top edge (found 3 Nov 2026). It may use the
      // whole screen instead, and follows the lists as the sheet settles,
      // which no scroll or resize reports.
      floatingOptions: { shiftOptions: { crossAxis: true, boundary: "clippingAncestors" }, autoUpdate: { animationFrame: true } },
    },
    {
      // On the phone screen the scale opens in the sheet, not beside the box
      ...SEVERITY_STEP,
    },
    { ...SCENE_STEP, sheet: "full" },
    {
      title: "Next Image",
      after: CONTRIBUTOR_SUBMIT_STEP.touchAfter,
    },
  ],
});

// Annotators on a phone or tablet (12 Oct 2026). Their cards are in the answers
// sheet: the top part (#box-review-section-peek, #sidewalk-tools) is always in
// view, and the cards below it are in the part pulled up (sheet: "full").
const ANNOTATOR_TOUCH_TOURS = Object.freeze({
  objects: Object.freeze({
    targets: Object.freeze([".rp-stage", "#add-box-button", "#box-review-section-peek", "#taxonomy-guide", "button[type='submit']"]),
    placements: ["center", "top", "top", "center", "top"],
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

/** Added to the first step of every annotator touch tour on a phone (not a tablet). */
export const PHONE_FULL_SCREEN_SENTENCE = "On a phone, the button at the bottom right of the photo shows the photo full screen, which you can also use with the phone held sideways.";
/** Added to the first step of every annotator touch tour on a tablet (12 Oct 2026). */
export const TABLET_FULL_SCREEN_SENTENCE = "The button at the bottom right of the photo shows the photo full screen.";
/**
 * The contributor touch tour's first note, on a phone and a tablet alike (S16):
 * the two sentences above, shortened to fit the step's budget.
 */
export const FULL_SCREEN_TIP = "Tip: the photo's bottom-right button goes full screen.";

const ANNOTATOR_TOURS = Object.freeze({
  objects: Object.freeze({ targets: ANNOTATOR_TARGETS, placements: ANNOTATOR_PLACEMENTS, copy: ANNOTATOR }),
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
 * its targets, on every device (12 Oct 2026). Before, an iPad held
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

export function tourTargets(isAnnotator = false, step = "objects", input = "pointer") {
  return tourFor(isAnnotator, step, input).targets;
}

export function tourStepCount(isAnnotator = false, step = "objects", input = "pointer") {
  return tourTargets(isAnnotator, step, input).length;
}

/** A list point as a sentence of its own, for `content` */
const asSentence = (text) => (/[.?!”]$/.test(text) ? text : `${text}.`);

/**
 * A contributor step's words in this wording: `intro`, `points` and `note`,
 * or their touch versions where the step has them.
 */
function contributorWords(entry, touchWords) {
  const pick = (key, touchKey) => (touchWords && entry[touchKey] !== undefined ? entry[touchKey] : entry[key]);
  return {
    intro: pick("intro", "touchIntro"),
    points: [...(pick("points", "touchPoints") || [])],
    after: pick("after", "touchAfter"),
    note: pick("note", "touchNote"),
    pointNote: entry.pointNote,
  };
}

/**
 * The react-joyride steps for this person, annotator step and input.
 *
 * `options.words` ("pointer" by default) picks the wording of a pointer tour:
 * with "touch", a step that has `touchContent` (annotators) or `touchIntro`,
 * `touchPoints` and `touchNote` (contributors) uses it. The touch tours
 * ignore it. `options.phone` adds the full-screen sentence to the first step
 * of a touch tour, and `options.tablet` adds the tablet's. Contributors get
 * FULL_SCREEN_TIP as that step's note on either. Never on a pointer tour:
 * phones and tablets always have the sheet layout, so the touch tours. A
 * touch step in the part of the sheet pulled down keeps its `sheet: "full"`,
 * for the tutorial page to move the sheet.
 *
 * A contributor step also carries `intro`, `points` and `note` (S16), and
 * `after` (S16b), which the tutorial page turns into a paragraph, a numbered
 * list (none when `points` is empty), a paragraph and a muted line. Its
 * `content` is the same text as plain sentences, in that order, ending with
 * `zoomNote` (S28) where the step has one. `pointNote`
 * (S3) is a sentence that follows one point's text inside that point,
 * `{ after, text }`, and comes right after that point in `content`. It is
 * apart from the point only so the point's own word limit still applies.
 */
export function buildTourSteps(isAnnotator = false, step = "objects", input = "pointer", { words = "pointer", phone = false, tablet = false } = {}) {
  const { copy, targets, placements } = tourFor(isAnnotator, step, input);
  const touchWords = input === "pointer" && words === "touch";
  return copy.map((entry, i) => {
    let text;
    if (isAnnotator) {
      let content = touchWords && entry.touchContent ? entry.touchContent : entry.content;
      if (input === "touch" && phone && i === 0) content = `${content} ${PHONE_FULL_SCREEN_SENTENCE}`;
      else if (input === "touch" && tablet && i === 0) content = `${content} ${TABLET_FULL_SCREEN_SENTENCE}`;
      text = { content };
    } else {
      const { intro, points, after, note, pointNote } = contributorWords(entry, touchWords);
      const fullNote = input === "touch" && (phone || tablet) && i === 0 ? FULL_SCREEN_TIP : note;
      // The laptop zoom line (S28): the pointer tour worded for a mouse, where scrolling moves the photo
      const zoomNote = input === "pointer" && !touchWords ? entry.zoomNote : undefined;
      const sentences = points.flatMap((point, p) =>
        pointNote && pointNote.after === p + 1 ? [asSentence(point), pointNote.text] : [asSentence(point)]
      );
      text = {
        ...(intro ? { intro } : {}),
        points,
        ...(pointNote ? { pointNote: { ...pointNote } } : {}),
        ...(after ? { after } : {}),
        ...(fullNote ? { note: fullNote } : {}),
        ...(zoomNote ? { zoomNote } : {}),
        content: [intro, ...sentences, after, fullNote, zoomNote].filter(Boolean).join(" "),
      };
    }
    return {
      target: targets[i],
      title: entry.title,
      ...text,
      skipBeacon: true,
      overlayClickAction: "none",
      placement: placements[i],
      // On the phone screen nothing but the sheet's own list may scroll, and
      // the tutorial page moves that itself. The tour library's scrolling
      // shifted the whole screen (12 Oct 2026). The library flips a card that
      // has no room above its target to below it, but never moves it up or
      // down into the screen, so a card with no room either side ran off it
      // (S16): `crossAxis` lets it slide up or down until it is in view.
      // A step's own positioning is added (S16b: Check Each Box right of the photo)
      ...(input === "touch" || entry.floatingOptions
        ? { floatingOptions: { ...(input === "touch" ? { shiftOptions: { crossAxis: true } } : {}), ...entry.floatingOptions } }
        : {}),
      ...(input === "touch" ? { skipScroll: true } : {}),
      // No taller than the room beside its target, for the tutorial page (S16b)
      ...(entry.fitBesideTarget ? { fitBesideTarget: true } : {}),
      ...(entry.sheet ? { sheet: entry.sheet } : {}),
    };
  });
}
