import TUTORIAL_IMAGES from "@/data/tutorialImages";
import { normalizeMark } from "@/util/boxGeometry";
import { offSidewalkPatch, onSidewalkPatch } from "@/util/suggestionJudgment";
import { emptySceneLevel } from "@/util/validators/sceneQuestions.mjs";

/**
 * The landing page's preview of the contributor task (HowItWorks).
 *
 * A scripted run through one image, played by scrolling: the cursor answers
 * Step 1 (S15: Yes, there is a sidewalk), the model's suggestions, rates a
 * severity, draws a box the model missed, answers Step 3 and moves to the
 * next image. Pure: `demoFrame(progress)`
 * replays every step up to that point of the scroll and returns what the
 * screen shows, so scrolling back and forth always lands on the same picture.
 *
 * The answers are illustrative. They follow the real tool's rules (the same
 * fields change as when a contributor clicks, see ReactPictureAnnotation's
 * onSelectObstruction, onUnselectObstruction, onSetObstructs and
 * onSetSeverity), but which object gets which answer is only for show:
 * Tree #1 first, Yes with severity 1, then Car and Lamp Post #1 not on the
 * path, Motorcycle #1 on it but No, the drawn Lamp Post #2 Yes with severity 4, and Step 3
 * (S15, 9 Nov 2026) in its order: Limited (two_people), Unobstructed (5),
 * Flat (3), Concrete or asphalt, Intact (3) and Barrier (true). The numbered
 * answers run worst to best (22 Oct 2026, validators/sceneScale.mjs). The
 * photo has a sidewalk, so every box keeps both questions. Every object is first answered
 * on the sidewalk question, as the tool asks it before the obstruction
 * question (S12, 2 Nov 2026). Car #1 and Lamp Post #1 get No there, so their
 * boxes leave the photo and they are listed under Not obstructions (Rans,
 * 2 Nov 2026), and the rest Yes.
 *
 * Time is in ticks, 0 to 1000, across the whole scroll, the first ENTRANCE_END
 * of them while the preview slides into view (HowItWorks). The script is one
 * TIMELINE in beats, laid out over the ticks, so a step can be added, removed
 * or lengthened without working out every tick by hand.
 */

export const TICKS = 1000;

/** The two photos, from the tutorial set: already public, with their boxes. */
export const DEMO_IMAGES = Object.freeze([TUTORIAL_IMAGES[0], TUTORIAL_IMAGES[1]]);
/** Image pixel size of the tutorial photos */
export const DEMO_IMAGE_SIZE = Object.freeze({ width: 640, height: 360 });

export const DRAWN_ID = "demo-drawn-1";
/** Where the drawn box starts and ends, in image px: the white post on the sidewalk */
export const DRAW_FROM = Object.freeze([428, 96]);
export const DRAW_TO = Object.freeze([450, 216]);

/**
 * Cursor targets. The stage turns each into a point (see DemoStage).
 * Exported with the mutations below for the phone and tablet script
 * (touchScript.js, 22 Oct 2026), so both previews give the same answers.
 */
export const OFF = Object.freeze({ kind: "off" });
export const box = (id) => ({ kind: "box", id });
export const img = ([x, y]) => ({ kind: "image", x, y });
export const ui = (name, extra = {}) => ({ kind: "ui", name, ...extra });

/** The suggestions on the first photo, by what they are */
export const ids = Object.freeze({
  lamp: "tut1-box1",
  tree: "tut1-box2",
  car: "tut1-box3",
  moto: "tut1-box4",
});

// ---- Mutations: each mirrors the tool's handler for the same click ----

export const find = (s, id) => s.boxes.find((b) => b.id === id);

export function select(id) {
  return (s) => {
    s.selectedId = id;
    s.picker = null;
  };
}

export function close(s) {
  s.selectedId = null;
  s.picker = null;
  s.dropdown = null;
}

/** Yes to the sidewalk question (onSetOnSidewalk(true)): the panel moves on to the obstruction question */
export function sidewalkYes(id) {
  return (s) => {
    const target = find(s, id);
    Object.assign(target, onSidewalkPatch(target));
  };
}

/** No to the sidewalk question (onSetOnSidewalk(false)): the box leaves the photo and the panel closes */
export function sidewalkNo(id) {
  return (s) => {
    const target = find(s, id);
    Object.assign(target, offSidewalkPatch(target));
    close(s);
  };
}

/** No on a suggestion (onUnselectObstruction) */
export function suggestionNo(id) {
  return (s) => {
    Object.assign(find(s, id), { selected: false, isRejected: true, obstructs: false, severity: null });
    close(s);
  };
}

/** A first Yes on a suggestion (onSelectObstruction): the panel stays open on the severity picker */
export function suggestionYes(id) {
  return (s) => {
    Object.assign(find(s, id), { selected: true, isRejected: false, obstructs: true });
    s.picker = 3; // SeverityPicker starts at 3 when there is no severity yet
  };
}

/** Yes on a drawn box (onSetObstructs(true)) */
export function drawnYes(id) {
  return (s) => {
    Object.assign(find(s, id), { obstructs: true, severity: null });
    s.picker = 3;
  };
}

/** Confirm on the severity picker (onSetSeverity), which closes the panel */
export function confirmSeverity(id) {
  return (s) => {
    Object.assign(find(s, id), { severity: s.picker, obstructs: true });
    close(s);
  };
}

function finishDraft(s) {
  const [x0, y0] = DRAW_FROM;
  const [x1, y1] = DRAW_TO;
  s.boxes.push({
    id: DRAWN_ID,
    mark: normalizeMark({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, type: "RECT" }),
    editable: true,
    selected: false,
  });
  s.draft = null;
  s.selectedId = DRAWN_ID;
  s.picker = null;
}

export function chooseCategory(value) {
  return (s) => {
    find(s, s.selectedId).comment = value;
    s.dropdown = null;
  };
}

/** Step 1 (S15, onPresenceAnswer): the preview's photo has a sidewalk, so nothing is reset */
export function answerPresence(value) {
  return (s) => {
    s.hasSidewalk = value;
  };
}

export function answerScene(updates) {
  return (s) => {
    s.scene = { ...s.scene, ...updates };
  };
}

function nextImage(s) {
  s.imageIndex = 1;
  s.boxes = freshBoxes(1);
  s.scene = emptyScene();
  s.hasSidewalk = null;
  s.saving = false;
  close(s);
}

// ---- The script ----

/**
 * The tick the preview has fully slid into view and pins (HowItWorks starts
 * playing half a screen early, over a track 4.6 screens tall: 0.5 / 4.1).
 */
export const ENTRANCE_END = 122;
/**
 * The tick the camera starts to go close in: a short scroll after the page
 * pins, so it is seen whole as it slides in and settles, and the next scroll
 * goes close in (Rans, 15 Oct 2026: going close in while it was still
 * arriving felt rushed, and half a screen of stillness after it felt slow).
 */
export const HOLD_END = 142;
/** The tick Next Image's save finishes. The second photo shows until the end. */
export const LAST_TICK = 940;

/** A wait between steps, in beats */
export const wait = (beats) => ({ beats });
/** Everything before this ends at `tick`, and what follows is laid out from there */
export const until = (tick) => ({ until: tick });
/** A move, press, drag or hold, named so tests and the stills can find it */
export const step = (name, type, beats, more = {}) => ({ name, type, beats, ...more });
/** The sidewalk question for the object `name` (S12): Yes, or "no" */
export const answerOnSidewalk = (name, then, answer = "yes") => [
  step(`${name}-to-sidewalk`, "move", 3, { to: ui(`sidewalk-${answer}`) }),
  step(`${name}-sidewalk`, "press", 1.5, { then }),
];
/** No on a suggestion: open it, Yes to the sidewalk question, then No */
const answerNo = (key) => [
  step(`to-${key}`, "move", 4, { to: box(ids[key]) }),
  step(`${key}-open`, "press", 1.5, { then: select(ids[key]) }),
  ...answerOnSidewalk(key, sidewalkYes(ids[key])),
  step(`${key}-to-no`, "move", 3, { to: ui("no") }),
  step(`${key}-no`, "press", 1.5, { then: suggestionNo(ids[key]) }),
];
/** A suggestion not on the path: open it, then No to the sidewalk question, and its box leaves the photo */
const answerOffPath = (key) => [
  step(`to-${key}`, "move", 4, { to: box(ids[key]) }),
  step(`${key}-open`, "press", 1.5, { then: select(ids[key]) }),
  ...answerOnSidewalk(key, sidewalkNo(ids[key]), "no"),
  // A moment to see the box gone from the photo and listed under Not obstructions
  wait(1.5),
];
/** Step 1 (S15): move to Yes, then click it */
export const answerStep1 = () => [
  step("to-presence", "move", 6, { to: ui("presence", { value: true }) }),
  step("presence", "press", 2, { then: answerPresence(true) }),
];
/** A Step 3 answer: move to the option, then click it */
const sceneAnswer = (field, value) => [
  step(`to-${field}`, "move", 4, { to: ui("scene", { field, value }) }),
  step(field, "press", 1.5, { then: answerScene({ [field]: value }) }),
];

/**
 * The whole run, in order. Steps: `move` glides the cursor to a target,
 * `press` holds the button down and applies `then` on release, `drag` holds
 * it down while moving and calls `during(state, t)` on the way, `hold` waits
 * and applies `then`. `chapter` and `camera` mark where a caption or a shot
 * starts, and `card` where the step card fades (`"faded"`) and comes back
 * (`"shown"`), and take no time. Beats are relative: the run is stretched to fill
 * 0 to LAST_TICK, except that what comes before an `until` is stretched to
 * end at its tick, and what follows starts there.
 */
/** Step 3's scripted answers, in the order shown (S15), shared with touchScript.js */
export const STEP3_ANSWERS = Object.freeze([
  ["sidewalkWidth", "two_people"],
  ["overallAccessibility", 5],
  ["surfaceEvenness", 3],
  ["surfaceType", "concrete"],
  ["surfaceCondition", 3],
  ["roadBarrier", true],
]);

const TIMELINE = [
  { chapter: "rate" },
  { camera: "overview" },
  // The page slides in and pins, and the whole of it holds still a moment
  wait(1),
  until(HOLD_END),
  // Step 1 first (S15), still in the whole-page shot, above the photo's card
  ...answerStep1(),
  // Then the camera goes close in, and the cursor sets off for Tree #1
  { camera: "photo" },
  wait(3),
  step("to-tree", "move", 11, { to: box(ids.tree) }),
  step("tree-open", "press", 2, { then: select(ids.tree) }),
  ...answerOnSidewalk("tree", sidewalkYes(ids.tree)),
  step("tree-to-yes", "move", 6, { to: ui("yes") }),
  step("tree-yes", "press", 2, { then: suggestionYes(ids.tree) }),
  step("tree-to-slider", "move", 5, { to: ui("slider", { value: 3 }) }),
  step("tree-severity", "drag", 9, { to: ui("slider", { value: 1 }), during: (s, t) => { s.picker = Math.round(3 - 2 * t); } }),
  step("tree-to-confirm", "move", 5, { to: ui("confirm") }),
  step("tree-confirm", "press", 2, { then: confirmSeverity(ids.tree) }),
  // Straight on to the rest, close in (no look back at the lists: it broke the flow, Rans, 15 Oct 2026)
  { chapter: "answer" },
  // Car #1's panel opens over the step card's corner, and DemoStage fades the
  // card for it (the overlap depends on the screen). Motorcycle #1's does not
  ...answerOffPath("car"),
  ...answerNo("moto"),
  ...answerOffPath("lamp"),
  { chapter: "draw" },
  step("to-draw", "move", 6, { to: img(DRAW_FROM) }),
  step("draw", "drag", 10, {
    to: img(DRAW_TO),
    during: (s, t) => {
      const [x0, y0] = DRAW_FROM;
      const [x1, y1] = DRAW_TO;
      s.selectedId = null;
      s.draft = { x: x0, y: y0, width: (x1 - x0) * t, height: (y1 - y0) * t };
    },
    then: finishDraft,
  }),
  // The drawn box's panel, its category list and its severity all open over
  // the step card's corner, one after another: the card is at full strength
  // while the box is drawn, fades as the panel appears, and stays faded until
  // the severity is in (Rans, 15 Oct 2026)
  { card: "faded" },
  step("to-category", "move", 5, { to: ui("category") }),
  step("category-open", "press", 2, { then: (s) => { s.dropdown = { highlighted: null }; } }),
  step("to-option", "move", 6, {
    to: ui("option", { value: "lamp_post" }),
    during: (s, t) => { if (t > 0.6) s.dropdown = { highlighted: "lamp_post" }; },
  }),
  step("category-pick", "press", 2, { then: chooseCategory("lamp_post") }),
  ...answerOnSidewalk("drawn", sidewalkYes(DRAWN_ID)),
  step("drawn-to-yes", "move", 5, { to: ui("yes") }),
  step("drawn-yes", "press", 2, { then: drawnYes(DRAWN_ID) }),
  step("drawn-to-slider", "move", 4, { to: ui("slider", { value: 3 }) }),
  step("drawn-severity", "drag", 6, { to: ui("slider", { value: 4 }), during: (s, t) => { s.picker = Math.round(3 + t); } }),
  step("drawn-to-confirm", "move", 4, { to: ui("confirm") }),
  step("drawn-confirm", "press", 2, { then: confirmSeverity(DRAWN_ID) }),
  { card: "shown" },
  // Step 3 in the whole-page shot (Rans, 15 Oct 2026)
  { camera: "overview" },
  { chapter: "scene" },
  wait(2),
  ...STEP3_ANSWERS.flatMap(([field, value]) => sceneAnswer(field, value)),
  { chapter: "next" },
  wait(1),
  step("to-next", "move", 5, { to: ui("next") }),
  step("next", "press", 2, { then: (s) => { s.saving = true; } }),
  step("saving", "hold", 4, { then: nextImage }),
];

/**
 * Lays the timeline over the ticks: the steps, where each chapter starts, and
 * where each shot starts. Each stretch between `until` marks is laid out over
 * its own ticks, in proportion to its beats.
 */
export function layOut(timeline, last) {
  const stretches = [];
  let entries = [];
  let from = 0;
  for (const entry of timeline) {
    if (entry.until == null) {
      entries.push(entry);
      continue;
    }
    stretches.push({ entries, from, to: entry.until });
    entries = [];
    from = entry.until;
  }
  stretches.push({ entries, from, to: last });

  const steps = [];
  const chapters = [];
  const camera = [];
  const card = [Object.freeze({ at: 0, faded: false })];
  for (const stretch of stretches) {
    const total = stretch.entries.reduce((n, e) => n + (e.beats || 0), 0) || 1;
    const tickAt = (beat) => Math.round((stretch.from + (beat * (stretch.to - stretch.from)) / total) * 10) / 10;
    let beat = 0;
    for (const entry of stretch.entries) {
      const at = tickAt(beat);
      if (entry.chapter) chapters.push(Object.freeze({ id: entry.chapter, start: at }));
      if (entry.camera) camera.push(Object.freeze({ at, region: entry.camera }));
      if (entry.card) card.push(Object.freeze({ at, faded: entry.card === "faded" }));
      if (entry.type) {
        const { beats, ...rest } = entry;
        steps.push(Object.freeze({ ...rest, at, end: tickAt(beat + beats) }));
      }
      beat += entry.beats || 0;
    }
  }
  return { steps: Object.freeze(steps), chapters: Object.freeze(chapters), camera: Object.freeze(camera), card: Object.freeze(card) };
}

const LAID_OUT = layOut(TIMELINE, LAST_TICK);

/** Every step, in order, with the tick it starts at and the tick it ends at */
export const STEPS = LAID_OUT.steps;
/** The chapters the captions follow, with the tick each starts at */
export const CHAPTERS = LAID_OUT.chapters;
/**
 * Where the camera looks from each tick on: the whole page while the preview
 * slides in and for a moment after it pins (until HOLD_END), close in on the
 * photo for Steps 1 to 3 without a break, then the whole page for Step 2 and
 * Next Image. Step 2 is answered in the whole-page shot, not centred on its own: a
 * close shot of the narrow column left empty ground beside it (Rans, 15 Oct
 * 2026). The stage measures each region and eases the camera there (see
 * DemoStage), so these are targets, not paths. On a phone the stage swaps in
 * readable regions for the whole page.
 */
export const CAMERA = LAID_OUT.camera;

/**
 * When the step card is faded, from each tick on: while a panel opens over its
 * corner, so it is faded before the panel appears rather than after, and
 * stays faded through steps that follow close on each other (Rans, 15 Oct
 * 2026). DemoStage also fades it whenever the action comes under it at
 * another screen size.
 */
export const CARD = LAID_OUT.card;

/** Whether the step card is faded at a tick */
export function cardFadedAt(tick) {
  let faded = false;
  for (const c of CARD) {
    if (tick >= c.at) faded = c.faded;
  }
  return faded;
}

/** When a named step of `steps` starts, or ends (`"end"`), in ticks */
export function stepTick(steps, name, edge = "start") {
  const found = steps.find((s) => s.name === name);
  if (!found) throw new Error(`No step named ${name}`);
  return edge === "end" ? found.end : found.at;
}

/** When a named step starts, or ends (`"end"`), in ticks */
export function tickOf(name, edge = "start") {
  return stepTick(STEPS, name, edge);
}

export function freshBoxes(imageIndex) {
  return DEMO_IMAGES[imageIndex].annotationList.map((b) => ({
    id: b.id,
    comment: b.comment,
    mark: { ...b.mark },
    editable: false,
    selected: false,
    isRejected: false,
    initialState: { comment: b.comment, mark: { ...b.mark } },
    // The practice's proposal on Tree #1 (S3, 6 Nov 2026), so the preview
    // shows the model's hint on Question 2 as the tutorial does
    ...(typeof b.proposedObstructs === "boolean" ? { proposedObstructs: b.proposedObstructs } : {}),
  }));
}

export function emptyScene() {
  return emptySceneLevel();
}

export function initialState() {
  return {
    imageIndex: 0,
    boxes: freshBoxes(0),
    selectedId: null,
    draft: null,
    picker: null,
    dropdown: null,
    scene: emptyScene(),
    // Step 1 (S15): null until the cursor answers it
    hasSidewalk: null,
    saving: false,
  };
}

/** Smooth start and stop for every glide */
export function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Which of `chapters` a tick falls in */
export function chapterIn(chapters, tick) {
  let index = 0;
  chapters.forEach((c, i) => {
    if (tick >= c.start) index = i;
  });
  return index;
}

/** Which chapter a tick falls in */
export function chapterAt(tick) {
  return chapterIn(CHAPTERS, tick);
}

/** The camera's region at a tick */
export function cameraAt(tick) {
  let region = CAMERA[0].region;
  for (const c of CAMERA) {
    if (tick >= c.at) region = c.region;
  }
  return region;
}

/**
 * What the preview shows at `progress` (0 to 1) of the scroll.
 *
 * cursor: { from, to, t, pressed, visible }, targets the stage resolves.
 * camera: the name of the region the camera should show.
 * Everything else is the screen's state: the boxes in the shape the tool
 * keeps them, the open box, the severity picker's value, the category list,
 * Step 2's answers, and whether Next Image is saving.
 */
export function demoFrame(progress) {
  const p = Number.isFinite(progress) ? clamp01(progress) : 0;
  const tick = p * TICKS;
  const state = initialState();
  const cursor = replay(STEPS, tick, state);

  return {
    tick,
    chapter: chapterAt(tick),
    ...state,
    cursor,
    camera: cameraAt(tick),
    cardFaded: cardFadedAt(tick),
  };
}

/**
 * Plays `steps` up to `tick` on `state` (changed in place) and returns the
 * cursor: { from, to, t, pressed, visible }. Shared by demoFrame and the phone
 * and tablet script (touchScript.js), so both play a script the same way.
 */
export function replay(steps, tick, state) {
  let at = OFF;
  let cursor = { from: OFF, to: OFF, t: 1, pressed: false };

  for (const step of steps) {
    if (tick < step.at) break;
    const done = tick >= step.end;
    const raw = done ? 1 : clamp01((tick - step.at) / (step.end - step.at));
    if (step.type === "move" || step.type === "drag") {
      const t = step.type === "drag" ? raw : easeInOut(raw);
      cursor = { from: at, to: step.to, t, pressed: step.type === "drag" && !done };
      if (step.during) step.during(state, raw);
      if (done) {
        at = step.to;
        if (step.then) step.then(state);
      }
    } else {
      // press or hold: the cursor stays where it is
      cursor = { from: at, to: at, t: 1, pressed: step.type === "press" && !done };
      if (done && step.then) step.then(state);
    }
  }

  return { ...cursor, visible: tick >= steps[0].at };
}
