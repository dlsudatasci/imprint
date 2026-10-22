import { addBoxPlacement, markCorners, moveCorner } from "@/ui/annotation-tool/touchGeometry";
import { buildPeekChips } from "@/features/annotate/objectTrays";
import { buildDisplayLabelsInOrder, orderOfAppearance } from "@/util/buildDisplayLabels";
import {
  DEMO_IMAGE_SIZE,
  DRAWN_ID,
  HOLD_END,
  LAST_TICK,
  TICKS,
  answerScene,
  box,
  chapterIn,
  chooseCategory,
  clamp01,
  close,
  confirmSeverity,
  drawnYes,
  emptyScene,
  find,
  freshBoxes,
  ids,
  img,
  initialState,
  layOut,
  replay,
  select,
  step,
  stepTick,
  suggestionNo,
  suggestionYes,
  ui,
  until,
  wait,
} from "./demoScript";

/**
 * The landing page's preview on phones and tablets (22 Oct 2026): the same
 * task as demoScript.js, played on the annotation screen contributors get on
 * a phone or tablet (the sheet layout: the photo above, the answers in a
 * bottom sheet), with a finger instead of a cursor. Shown wherever the tool
 * itself would use that layout (layoutFor in useAnnotateLayout.js): under
 * 1024 px, and on every touch device.
 *
 * The same answers as on a laptop, given the way a phone gives them: Tree #1
 * is tapped on the photo, Yes, severity 1. Next at the top of the sheet opens
 * the rest in the tool's own order (Lamp Post #1, Car #1, Motorcycle #1), each
 * No. Add box puts a box in the middle of the photo, its corners are dragged
 * onto the white post on the sidewalk, Lamp Post, Yes, severity 4. The Step 2
 * line pulls the sheet up to Step 2: Moderate, Easy to traverse, Comfortable,
 * Easily accessible. Then Next Image.
 *
 * Every change mirrors the tool's handler for the same tap, as in
 * demoScript.js, whose mutations it shares. Pure: `touchFrame(progress)`
 * replays every step up to that point, so scrolling back and forth always
 * lands on the same picture. The same scroll as on a laptop (HowItWorks:
 * TRACK_SCREENS, LEAD_IN, so ENTRANCE_END and HOLD_END), laid out over 0 to
 * LAST_TICK.
 */

/** Where Add box puts its box on the tutorial photo, image px: the tool's addBoxPlacement on the whole photo */
export const ADD_BOX_MARK = Object.freeze(
  addBoxPlacement({ x: 0, y: 0, width: DEMO_IMAGE_SIZE.width, height: DEMO_IMAGE_SIZE.height }, DEMO_IMAGE_SIZE)
);

/**
 * Where its corners are dragged to, image px: the white post on the sidewalk.
 * 34 px wide, a little wider than the post, so the tool's smallest box
 * (TOUCH_MIN_SIDE_PX, 16 CSS px) never stops a corner short on any screen the
 * preview draws the photo at (at least 320 px across, TouchStage).
 */
export const FIT_TO = Object.freeze({ x: 421, y: 96, width: 34, height: 120 });

/** The two drags: the top-right corner up and right, then the bottom-left one in */
const FIRST = Object.freeze({ corner: 1, from: markCorners(ADD_BOX_MARK)[1], to: { x: FIT_TO.x + FIT_TO.width, y: FIT_TO.y } });
const AFTER_FIRST = Object.freeze(moveCorner(ADD_BOX_MARK, FIRST.corner, FIRST.to, { x: 0, y: 0 }, 0, DEMO_IMAGE_SIZE.width, DEMO_IMAGE_SIZE.height));
const SECOND = Object.freeze({ corner: 3, from: markCorners(AFTER_FIRST)[3], to: { x: FIT_TO.x, y: FIT_TO.y + FIT_TO.height } });

const lerp = (a, b, t) => a + (b - a) * t;

// ---- Mutations the phone adds to demoScript's ----

/** Next at the top of the sheet (openNextToDecide): the first object still to decide, in the lists' order */
function openNext(s) {
  const { nextId } = buildPeekChips(orderOfAppearance(s.boxes), { labels: buildDisplayLabelsInOrder(s.boxes) });
  if (nextId) select(nextId)(s);
}

/** No on whichever suggestion is open */
function noOnOpen(s) {
  if (s.selectedId) suggestionNo(s.selectedId)(s);
}

/** Add box (addBoxFromButton): a drawn box in the middle of the photo, open, with its hint over the photo */
function addBox(s) {
  s.boxes.push({ id: DRAWN_ID, mark: { ...ADD_BOX_MARK }, editable: true, selected: false, drawnOrder: 1 });
  s.selectedId = DRAWN_ID;
  s.picker = null;
  s.dropdown = null;
  s.hint = true;
}

/**
 * A corner dragged by the finger (moveCorner, the finger on the corner): the
 * hint goes as the drag starts, and the magnifier shows the corner until the
 * finger lifts.
 */
function dragCorner({ corner, from, to }, markAtStart) {
  return {
    during: (s, t) => {
      const point = { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
      find(s, DRAWN_ID).mark = moveCorner(markAtStart, corner, point, { x: 0, y: 0 }, 0, DEMO_IMAGE_SIZE.width, DEMO_IMAGE_SIZE.height);
      s.hint = false;
      s.corner = point;
    },
    then: (s) => {
      s.corner = null;
    },
  };
}

/** The Step 2 line in the sheet (showSceneSection): the sheet goes up to full, at Step 2 */
function showScene(s) {
  close(s);
  s.sheet = "full";
  s.sceneFocus = null;
}

/** Next Image saved: the next photo, the sheet back down */
function nextImage(s) {
  s.imageIndex = 1;
  s.boxes = freshBoxes(1);
  s.scene = emptyScene();
  s.saving = false;
  s.sheet = "collapsed";
  s.sceneFocus = null;
  s.hint = false;
  close(s);
}

// ---- The script ----

/** No on the next object: Next, then No */
const nextNo = (key) => [
  step(`${key}-to-next`, "move", 4, { to: ui("peek-next") }),
  step(`${key}-open`, "press", 1.5, { then: openNext }),
  step(`${key}-to-no`, "move", 3.5, { to: ui("no") }),
  step(`${key}-no`, "press", 1.5, { then: noOnOpen }),
];

/** A Step 2 answer: the sheet scrolls to it as the finger goes there, then a tap */
const sceneAnswer = (field, value) => [
  step(`to-${field}`, "move", 4, {
    to: ui("scene", { field, value }),
    during: (s) => {
      s.sceneFocus = { field, value };
    },
  }),
  step(field, "press", 1.5, { then: answerScene({ [field]: value }) }),
];

/**
 * The whole run, in order, in demoScript's format (see its TIMELINE). No
 * camera: the whole screen is always in view. No step card fading: the card
 * is a band above the screen (HowItWorks).
 */
const TOUCH_TIMELINE = [
  { chapter: "rate" },
  // The screen slides in and pins, and holds still a moment
  wait(1),
  until(HOLD_END),
  wait(3),
  step("to-tree", "move", 9, { to: box(ids.tree) }),
  step("tree-open", "press", 2, { then: select(ids.tree) }),
  // The sheet comes up with its panel and the photo moves the tree clear of it
  wait(2),
  step("tree-to-yes", "move", 5, { to: ui("yes") }),
  step("tree-yes", "press", 2, { then: suggestionYes(ids.tree) }),
  step("tree-to-slider", "move", 4, { to: ui("slider", { value: 3 }) }),
  step("tree-severity", "drag", 8, { to: ui("slider", { value: 1 }), during: (s, t) => { s.picker = Math.round(3 - 2 * t); } }),
  step("tree-to-confirm", "move", 4, { to: ui("confirm") }),
  step("tree-confirm", "press", 2, { then: confirmSeverity(ids.tree) }),
  { chapter: "answer" },
  // Next opens them in the lists' order (test: lamp, car, moto)
  ...nextNo("lamp"),
  ...nextNo("car"),
  ...nextNo("moto"),
  { chapter: "draw" },
  step("to-add", "move", 5, { to: ui("addbox") }),
  step("add", "press", 2, { then: addBox }),
  wait(2),
  step("to-corner-1", "move", 4, { to: img([FIRST.from.x, FIRST.from.y]) }),
  step("fit-1", "drag", 7, { to: img([FIRST.to.x, FIRST.to.y]), ...dragCorner(FIRST, ADD_BOX_MARK) }),
  step("to-corner-2", "move", 4, { to: img([SECOND.from.x, SECOND.from.y]) }),
  step("fit-2", "drag", 7, { to: img([SECOND.to.x, SECOND.to.y]), ...dragCorner(SECOND, AFTER_FIRST) }),
  step("to-category", "move", 4, { to: ui("category") }),
  step("category-open", "press", 2, { then: (s) => { s.dropdown = { highlighted: null }; } }),
  step("to-option", "move", 5, {
    to: ui("option", { value: "lamp_post" }),
    during: (s, t) => { if (t > 0.6) s.dropdown = { highlighted: "lamp_post" }; },
  }),
  step("category-pick", "press", 2, { then: chooseCategory("lamp_post") }),
  step("drawn-to-yes", "move", 4, { to: ui("yes") }),
  step("drawn-yes", "press", 2, { then: drawnYes(DRAWN_ID) }),
  step("drawn-to-slider", "move", 4, { to: ui("slider", { value: 3 }) }),
  step("drawn-severity", "drag", 6, { to: ui("slider", { value: 4 }), during: (s, t) => { s.picker = Math.round(3 + t); } }),
  step("drawn-to-confirm", "move", 4, { to: ui("confirm") }),
  step("drawn-confirm", "press", 2, { then: confirmSeverity(DRAWN_ID) }),
  { chapter: "scene" },
  wait(1),
  step("to-scene", "move", 5, { to: ui("scene-line") }),
  step("scene-open", "press", 2, { then: showScene }),
  wait(2),
  ...sceneAnswer("sidewalkWidth", "two_people"),
  ...sceneAnswer("surfaceCondition", 3),
  ...sceneAnswer("walkability", 3),
  ...sceneAnswer("overallAccessibility", 5),
  { chapter: "next" },
  wait(1),
  step("to-next", "move", 5, { to: ui("next") }),
  step("next", "press", 2, { then: (s) => { s.saving = true; } }),
  step("saving", "hold", 4, { then: nextImage }),
];

const LAID_OUT = layOut(TOUCH_TIMELINE, LAST_TICK);

/** Every step, in order, with the tick it starts at and the tick it ends at */
export const TOUCH_STEPS = LAID_OUT.steps;
/** The chapters the captions follow, the same five as on a laptop */
export const TOUCH_CHAPTERS = LAID_OUT.chapters;

/** When a named step starts, or ends (`"end"`), in ticks */
export function touchTickOf(name, edge = "start") {
  return stepTick(TOUCH_STEPS, name, edge);
}

/**
 * What the phone or tablet preview shows at `progress` (0 to 1) of the
 * scroll: demoFrame's fields (no camera, no card), and
 *   snap        where the answers sheet rests: "panel" while a box is open,
 *               "full" for Step 2, else "collapsed" (the tool's sheetSnap)
 *   hint        Add box's "Drag the corners" line over the photo
 *   corner      the corner being dragged, image px, for the magnifier, or null
 *   sceneFocus  the Step 2 answer the finger is going to, which the sheet scrolls to
 */
export function touchFrame(progress) {
  const p = Number.isFinite(progress) ? clamp01(progress) : 0;
  const tick = p * TICKS;
  const state = { ...initialState(), sheet: "collapsed", hint: false, corner: null, sceneFocus: null };
  const cursor = replay(TOUCH_STEPS, tick, state);
  return {
    tick,
    chapter: chapterIn(TOUCH_CHAPTERS, tick),
    ...state,
    snap: state.selectedId ? "panel" : state.sheet,
    cursor,
  };
}
