/**
 * The practice on the first tutorial photo (S19, 7 Nov 2026, from Rans's
 * notes on pilot participant 4): instead of the tour's cards, the contributor
 * does each action themselves, guided by one short line at a time
 * (practiceCopy.js). The line moves on only once the action is done, which
 * practiceStepDone decides from the annotation tool's state, never from the
 * screen.
 *
 * The photo and its boxes are the home page preview's (demoScript.js): the
 * tree, the car, the motorcycle and the lamp post by `ids`, and the white post
 * the preview draws a box around (DRAW_FROM to DRAW_TO). The preview's
 * answers are the practice's steps, but only two answers are directed: the
 * tree is on the path (step 3) and the car is not (step 6), which the photo
 * settles. Whether the tree obstructs, and how much, is the contributor's own
 * answer (step 4, decided by Rans 7 Nov 2026), since its panel shows the
 * model's hint (S3) and a practice that made everyone choose Yes there would
 * teach them to follow it.
 *
 * The tool's state, as the tool sends it with each practice event
 * (ReactPictureAnnotation's onPracticeEvent):
 *
 *   { boxes: [{ id, comment, editable, mark, onSidewalk, obstructs, severity,
 *               selected, isRejected }],
 *     openId: the id of the box whose panel is open, or null,
 *     scene: Step 3's answers (SceneQuestions' sceneLevel),
 *     hasSidewalk: Step 1's answer, true, false or null (S15) }
 *
 * S15 (9 Nov 2026): a new first step, Step 1 (`presence`), done once it is
 * answered Yes, since the practice photo has a sidewalk raised on a curb.
 * Its lock opens no box and allows no drawing, as the tool's own rule "Step
 * 2 waits for Step 1" does anyway. Every step allows only Yes at Step 1
 * (`allowPresence`), so the practice never turns into the path's questions.
 * The practice has eleven steps.
 *
 * Each step's lock is the tool's `practiceLock`: which boxes open
 * (`openable`, a list or "all", and drawn boxes whenever drawing is allowed),
 * whether a box can be drawn (`canDraw`), whether Next Image works
 * (`canSubmit`), and which answer the box panel allows (`allowAnswers`: null
 * for any, or an object naming the one allowed answer to a question, with Not
 * an object off). Everything else on the photo is inert until its step.
 */
import { ids, DRAW_FROM, DRAW_TO } from "@/features/home/howItWorks/demoScript";
import { NOT_AN_OBJECT } from "@/util/suggestionJudgment";
import { sceneProgress, requiredSceneKeys } from "@/util/validators/sceneQuestions.mjs";
import { normalizeMark } from "@/util/boxGeometry";
import { computeIoU } from "@/util/validators/qualityMetrics";

/** The four suggestions on the practice photo, by what they are */
export const PRACTICE_IDS = ids;

/** The white post on the sidewalk the model missed, image px: the box drawn at step 7 is matched against it */
export const DRAW_TARGET = Object.freeze({
  x: DRAW_FROM[0],
  y: DRAW_FROM[1],
  width: DRAW_TO[0] - DRAW_FROM[0],
  height: DRAW_TO[1] - DRAW_FROM[1],
});

/** How closely the drawn box must cover the white post */
export const DRAW_MIN_IOU = 0.3;

/** How long the check mark shows on the next step's card once a step is done */
export const PRACTICE_CONFIRM_MS = 500;

// The panel's controls, by the data-control the landing preview finds them by
export const PRACTICE_SELECTORS = Object.freeze({
  onPathYes: "[data-control='on-sidewalk-yes']",
  onPathNo: "[data-control='on-sidewalk-no']",
  obstructsYes: "[data-control='yes']",
  obstructsNo: "[data-control='no']",
  modelHint: "[data-proposal-hint]",
  severity: "[data-control='severity']",
  confirm: "[data-control='confirm']",
  category: "[data-control='category']",
  addBox: "#add-box-button",
  // Step 1 (S15) and its Yes
  presence: "#sidewalk-presence-section",
  presenceYes: "[data-presence-option='true']",
  scene: "#scene-level-section",
  sceneLine: "#scene-level-peek",
  submit: "button[type='submit']",
  // The box panel beside the box on a laptop, which the card keeps clear of
  floatingPanel: ".rp-selected-input",
  // On touch, the answers sheet while a box's panel is in it, and the top bar
  answerSheet: "#answer-sheet",
  topBar: ".annotate-sheet-screen > header",
  // What the practice lights up (8 Nov 2026): the photo, the open box (the
  // tool marks it), Step 1 and Step 3's questions, and the answers sheet pulled up
  photo: "[data-photo-area]",
  // The white post's dashed outline, which the tool draws
  drawTarget: "[data-practice-highlight='rect']",
  // Every outline the tool draws on the photo: what a touch step lights (S23 B)
  outlines: "[data-practice-highlight]",
  openBox: "[data-practice-avoid]",
  sheetUp: "#answer-sheet button[aria-expanded='true']",
});

/** Step 3's questions in their order, each lit in turn at step 10: six for a sidewalk, two for a path (S15) */
export const sceneQuestionsFor = (state) => requiredSceneKeys(state?.hasSidewalk);
const sceneQuestion = (key) => `[data-scene-question='${key}']`;

const S = PRACTICE_SELECTORS;

// The tree's steps keep its Question 1 at Yes, so Back to Question 1 cannot
// take it off the path. Allowed from step 2, as the check mark shows for half
// a second after its panel opens.
// Step 1 allows only Yes on every step (S15): the photo has a sidewalk.
const PRESENCE_LOCK = Object.freeze({ openable: Object.freeze([]), canDraw: false, canSubmit: false, allowAnswers: Object.freeze({}), allowPresence: true });
const TREE_LOCK = Object.freeze({ openable: Object.freeze([ids.tree]), canDraw: false, canSubmit: false, allowAnswers: Object.freeze({ onSidewalk: true }), allowPresence: true });
const DRAW_LOCK = Object.freeze({ openable: Object.freeze([]), canDraw: true, canSubmit: false, allowAnswers: Object.freeze({}), allowPresence: true });
const OPEN_LOCK = Object.freeze({ openable: "all", canDraw: true, canSubmit: false, allowAnswers: null, allowPresence: true });

/** The eleven steps, in order. `key` names the line in practiceCopy.js. */
export const PRACTICE_STEPS = Object.freeze([
  { key: "presence", lock: PRESENCE_LOCK },
  { key: "openTree", lock: TREE_LOCK },
  { key: "treeOnPath", lock: TREE_LOCK },
  { key: "treeObstructs", lock: TREE_LOCK },
  { key: "treeSeverity", lock: TREE_LOCK },
  { key: "carOff", lock: Object.freeze({ openable: Object.freeze([ids.car]), canDraw: false, canSubmit: false, allowAnswers: Object.freeze({ onSidewalk: false }), allowPresence: true }) },
  { key: "drawPost", lock: DRAW_LOCK },
  { key: "answerDrawn", lock: DRAW_LOCK },
  { key: "lastTwo", lock: OPEN_LOCK },
  { key: "scene", lock: OPEN_LOCK },
  { key: "next", lock: Object.freeze({ ...OPEN_LOCK, canSubmit: true }) },
].map((step) => Object.freeze(step)));

export const PRACTICE_STEP_COUNT = PRACTICE_STEPS.length;

const keyOf = (step) => (typeof step === "string" ? step : typeof step === "number" ? PRACTICE_STEPS[step]?.key : step?.key);

const boxOf = (state, id) => state?.boxes?.find((box) => box.id === id) ?? null;

const hasCategory = (box) => Boolean(box?.comment) && box.comment !== "---" && box.comment !== NOT_AN_OBJECT;

/**
 * A box with its answers: off the path, or on it and answered whether it
 * obstructs, with a severity when it does. A suggestion marked Not an object
 * is answered too.
 */
export function boxAnswered(box) {
  if (!box) return false;
  if (!box.editable && box.comment === NOT_AN_OBJECT) return true;
  if (box.onSidewalk === false) return true;
  if (box.onSidewalk !== true) return false;
  if (box.obstructs === false) return true;
  return box.obstructs === true && box.severity != null;
}

/** How much of the white post a box covers, as IoU */
export function drawTargetIoU(mark) {
  if (!mark) return 0;
  return computeIoU(normalizeMark(mark), DRAW_TARGET);
}

/** The drawn box nearest the white post, if one covers it closely enough (DRAW_MIN_IOU) */
export function practiceDrawnBox(state) {
  let best = null;
  let bestIoU = 0;
  for (const box of state?.boxes ?? []) {
    if (!box.editable) continue;
    const iou = drawTargetIoU(box.mark);
    if (iou >= DRAW_MIN_IOU && iou > bestIoU) {
      best = box;
      bestIoU = iou;
    }
  }
  return best;
}

/** Whether `step` (a step, its key or its index) is done in this tool state. The last step is done by going to image 2. */
export function practiceStepDone(step, state) {
  const tree = boxOf(state, ids.tree);
  switch (keyOf(step)) {
    case "presence":
      return state?.hasSidewalk === true;
    case "openTree":
      return state?.openId === ids.tree;
    case "treeOnPath":
      return tree?.onSidewalk === true;
    case "treeObstructs":
      // Yes or No, the contributor's own answer
      return tree?.onSidewalk === true && (tree.obstructs === true || tree.obstructs === false);
    case "treeSeverity":
      // Any value. A No (also one given after Go back) has none to give.
      return tree?.obstructs === false || (tree?.obstructs === true && tree.severity != null);
    case "carOff":
      return boxOf(state, ids.car)?.onSidewalk === false;
    case "drawPost":
      return practiceDrawnBox(state) !== null;
    case "answerDrawn": {
      const drawn = practiceDrawnBox(state);
      return hasCategory(drawn) && boxAnswered(drawn);
    }
    case "lastTwo":
      return boxAnswered(boxOf(state, ids.moto)) && boxAnswered(boxOf(state, ids.lamp));
    case "scene": {
      const { answered, required } = sceneProgress(state?.scene, state?.hasSidewalk);
      return answered === required;
    }
    default:
      return false;
  }
}

/** Step 5 (treeSeverity) is skipped when the tree was answered No: there is no severity to give. */
export function practiceStepSkipped(step, state) {
  return keyOf(step) === "treeSeverity" && boxOf(state, ids.tree)?.obstructs === false;
}

/** The step after `index` (0-based), past any skipped. PRACTICE_STEP_COUNT once there is none. */
export function nextPracticeStep(index, state) {
  let next = index + 1;
  while (next < PRACTICE_STEP_COUNT && practiceStepSkipped(next, state)) next += 1;
  return next;
}

/**
 * The step to stay on after the tool's state changed. Only one step goes
 * back: the drawn box deleted, or fitted away from the post, at step 8
 * brings back step 7, so the line never asks to answer a box that is not there.
 */
export function practiceStepFor(index, state) {
  if (keyOf(index) === "answerDrawn" && !practiceStepDone("drawPost", state)) return index - 1;
  return index;
}

/** The step's lock for the tool (its `practiceLock` prop) */
export function practiceLockFor(step) {
  const key = keyOf(step);
  return PRACTICE_STEPS.find((s) => s.key === key)?.lock ?? null;
}

/**
 * What a step points at, for the tool and the guide (8 Nov 2026, after Rans
 * tried it, the tour's look):
 *
 *   highlight  the tool's outlines on the photo (`practiceHighlight`): a box,
 *              two boxes or the white post's dashed outline, and the open box
 *              marked with no outline (`avoidBoxIds`)
 *   spotlight  what stays lit while the rest of the screen is dimmed, as the
 *              tour does: the photo for every step on the photo (on a laptop
 *              the box panel is on it), on touch the answers sheet and the
 *              open box while a panel is the step, the next Step 3 question,
 *              and Next Image. Empty: nothing is dimmed. On touch a step on
 *              the photo lights only what it outlines (S23 B, Rans, 12 Nov
 *              2026: the box or boxes, the white post's outline, Add box
 *              before it is tapped, the new box after), with everything else
 *              dark. Until then it dimmed nothing (Rans, 8 Nov 2026: the
 *              whole photo lit with the sheet under it looked wonky).
 *   rings      the controls that get a pulsing ring: Question 1's Yes at step
 *              3, Yes and No at step 4 (back from 8 Nov 2026, Rans), Confirm
 *              at step 5, No at step 6, Add box on touch, the category field
 *              at step 8, Next Image. Never the model's line or the severity
 *              slider (Rans, 8 Nov 2026).
 *   cardNear   what the card is kept next to, on touch at step 7 (Rans,
 *              8 Nov 2026): the Add box button until it is tapped, then the
 *              white post's outline, kept clear of the new box's corners
 *              (`avoidBoxIds`). It went to the bottom of the screen when Add
 *              box opened the new box's panel in the sheet. Add box is
 *              ringed only until it is tapped (S23 B).
 *   fallback   on touch at step 10, the Step 3 line at the top of the answers
 *              sheet (lit and ringed) until the sheet is pulled up
 *              (`unless` is on the page)
 *   avoid      what the card also keeps clear of: the top bar on touch
 *   line       another of the step's lines for this state (practiceLine's
 *              `variant`), or null: on touch at step 7, "touchFit" once the
 *              new box is open and does not yet cover the post (S23 B)
 *
 * A step about a panel points at its box while the panel is closed.
 */
export function practiceTargets(step, state, words = "pointer") {
  const touch = words === "touch";
  const openId = state?.openId ?? null;
  const tree = boxOf(state, ids.tree);
  // The photo lit on a laptop. On touch only the outlined box, boxes or post
  // (S23 B), the rest of the screen dark and taking no presses.
  const onPhoto = touch ? [S.outlines] : [S.photo];
  const result = (highlight, { rings = [], spotlight = onPhoto, fallback = null, cardNear = null, line = null } = {}) => ({
    highlight,
    rings,
    spotlight,
    fallback,
    cardNear,
    avoid: touch ? [S.topBar] : [S.floatingPanel],
    line,
  });
  // A panel open: its controls, lit with the photo on a laptop (the panel
  // is on it), or with the answers sheet on touch, and its box marked
  const inPanel = (rings, extra = {}) => result(
    { ...extra, avoidBoxIds: [openId] },
    { rings, spotlight: touch ? [S.answerSheet, S.openBox] : [S.photo] }
  );
  const onTree = (rings) => (openId === ids.tree ? inPanel(rings) : result({ boxId: ids.tree }));
  const severityPending = (box) => box?.obstructs === true && box.severity == null;

  switch (keyOf(step)) {
    case "presence":
      // Step 1: on a laptop its card, on touch the top of the answers sheet
      return result(null, { rings: [S.presenceYes], spotlight: [S.presence] });
    case "openTree":
      return result({ boxId: ids.tree });
    case "treeOnPath":
      return onTree([S.onPathYes]);
    case "treeObstructs":
      // The contributor's own answer: Yes and No ringed alike, not the model's line
      return onTree([S.obstructsYes, S.obstructsNo]);
    case "treeSeverity":
      // Confirm only, not the slider. Go back on the picker brings the question back.
      return onTree(severityPending(tree) ? [S.confirm] : [S.obstructsYes, S.obstructsNo]);
    case "carOff":
      return openId === ids.car ? inPanel([S.onPathNo]) : result({ boxId: ids.car });
    case "drawPost":
      // Fitting the box is on the photo, also while the new box's panel is open
      if (!touch) return result({ rect: DRAW_TARGET });
      // The new box open: the card above the post, clear of the box's
      // corners, and the line says to drag its corners onto the outline
      // while it does not yet cover the post (S23 B). Add box is no longer
      // ringed: it has been tapped.
      // Lit: the post and the new box, so its corners can be dragged.
      if (openId) {
        const open = boxOf(state, openId);
        const fitting = Boolean(open?.editable) && drawTargetIoU(open.mark) < DRAW_MIN_IOU;
        return result({ rect: DRAW_TARGET, avoidBoxIds: [openId] }, { spotlight: [S.drawTarget, S.openBox], cardNear: S.drawTarget, line: fitting ? "touchFit" : null });
      }
      // Lit: Add box, to tap, and the post, where the box will go
      return result({ rect: DRAW_TARGET }, { rings: [S.addBox], spotlight: [S.addBox, S.drawTarget], cardNear: S.addBox });
    case "answerDrawn": {
      const drawn = practiceDrawnBox(state);
      if (!drawn) return result({ rect: DRAW_TARGET });
      if (openId !== drawn.id) return result({ boxId: drawn.id });
      if (!hasCategory(drawn)) return inPanel([S.category]);
      return inPanel(severityPending(drawn) ? [S.confirm] : []);
    }
    case "lastTwo": {
      const left = [ids.moto, ids.lamp].filter((id) => !boxAnswered(boxOf(state, id)));
      const boxIds = left.length ? left : [ids.moto, ids.lamp];
      if (openId) return inPanel(severityPending(boxOf(state, openId)) ? [S.confirm] : [], { boxIds: boxIds.filter((id) => id !== openId) });
      return result({ boxIds });
    }
    case "scene": {
      // The next question still to answer, one at a time
      const scene = state?.scene ?? {};
      const next = sceneQuestionsFor(state).find((key) => scene[key] === null || scene[key] === undefined);
      const spotlight = [next ? sceneQuestion(next) : S.scene];
      if (!touch) return result(null, { spotlight });
      return result(null, { spotlight, fallback: { unless: S.sheetUp, rings: [S.sceneLine], spotlight: [S.sceneLine] } });
    }
    case "next":
      return result(null, { rings: [S.submit], spotlight: [S.submit] });
    default:
      return result(null, { spotlight: [] });
  }
}
