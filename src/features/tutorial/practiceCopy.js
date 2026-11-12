/**
 * The words of the practice on the first tutorial photo (S19, 7 Nov 2026).
 *
 * One short line a step, in the order of PRACTICE_STEPS (practiceSteps.js),
 * with a touch version where a phone or tablet does it differently: "tap"
 * for "click", Add box for dragging out a box, and the Step 3 line at the
 * top of the answers sheet (the Step 2 line until S15). Each line is at most PRACTICE_LINE_WORDS words,
 * with no em dash and no semicolon (practiceCopy.test.js checks), and no
 * touch line says "click". A step may have a `note`, shown grey under its
 * line as the tour's notes are. The wording of steps 3, 4, 6, 7, 8 and 10 and of
 * the reminder is Rans's (8 Nov 2026), which took the limit from 15 words to
 * 22: step 6 now says why the car is not on the path, and step 7 that a missed
 * object is boxed whether or not it obstructs. Step 7 on touch has a second
 * line (`touchFit`, S23 B) for once Add box has made the new box.
 *
 * Only steps 3 and 6 say which answer to choose, both about whether the
 * object is on the path, which the photo settles. The obstruction question
 * and the severity are the contributor's own answers: the tree's panel
 * shows the model's hint (S3), and no line here may suggest that either has
 * a right answer (decided by Rans, 7 Nov 2026). S15 (9 Nov 2026) adds a
 * first step, Step 1, which also says which answer to choose: the photo has
 * a sidewalk raised on a curb, which the photo settles too.
 */

/** The most words a line may have */
export const PRACTICE_LINE_WORDS = 22;

export const PRACTICE_COPY = Object.freeze({
  /** The card's counter, "Practice 3 of 11" */
  counter: (n, total) => `Practice ${n} of ${total}`,
  skip: "Skip practice",
  /** Read out with the check mark after a step */
  stepDone: "Done",
  /** Under the top bar or the navbar on image 2, after the practice's last step (Rans, 8 Nov 2026) */
  reminder: "You can find more information by clicking the Tour button at the top of the page.",
  // On a phone or tablet the button is the ? in the top bar
  touchReminder: "You can find more information by tapping the ? button at the top of the screen.",
  // The button at the top on the first image, which does the practice again
  // in place of the tour (Rans, 8 Nov 2026): its label on a laptop, and its
  // name for screen readers and on hover (on a phone it is the ? icon)
  redoButton: "Practice",
  redoTitle: "Redo the practice",
  // Shown once Skip practice is chosen, by the button
  skipHint: "Click the Practice button at the top of the page to redo the practice.",
  touchSkipHint: "Tap ? at the top of the screen to redo the practice.",
  /** By step key, as PRACTICE_STEPS names them */
  lines: Object.freeze({
    // S15: Step 1, the only answer enabled is Yes
    presence: Object.freeze({
      pointer: "Step 1: this photo has a sidewalk raised on a curb. Choose Yes.",
    }),
    openTree: Object.freeze({
      pointer: "Click the dashed box on the tree.",
      touch: "Tap the dashed box on the tree.",
    }),
    treeOnPath: Object.freeze({
      pointer: "Is the tree on the sidewalk or the path? If it is, choose Yes.",
    }),
    treeObstructs: Object.freeze({
      pointer: "Does the object obstruct your way? You decide. The model can be wrong.",
    }),
    treeSeverity: Object.freeze({
      pointer: "Rate how much it blocks you, then Confirm.",
    }),
    carOff: Object.freeze({
      pointer: "Now for the car. This is an example of objects that aren't on the sidewalk, but beside it. Please choose No.",
    }),
    drawPost: Object.freeze({
      pointer: "If you find a missed object on the sidewalk, drag a box around it whether it obstructs or not.",
      touch: "If you find a missed object on the sidewalk, tap Add box and fit it, whether it obstructs or not.",
      // On touch once Add box made the new box and it does not yet cover the
      // white post (S23 B, 12 Nov 2026): what to do with it
      touchFit: "Drag the green box's corners onto the dashed outline around the white post.",
    }),
    answerDrawn: Object.freeze({
      pointer: "Pick its category, then answer both questions.",
      // What was boxed, as a grey note under the line, as the tour's notes are (Rans, 8 Nov 2026)
      note: "Hint: this is a lamp post.",
    }),
    lastTwo: Object.freeze({
      pointer: "Answer the last two boxes yourself.",
    }),
    scene: Object.freeze({
      pointer: "Next is Step 3: questions about the sidewalk itself.",
      touch: "Next is Step 3: questions about the sidewalk itself. Tap the Step 3 line.",
    }),
    next: Object.freeze({
      pointer: "All done. Click Next Image.",
      touch: "All done. Tap Next Image.",
    }),
  }),
});

/** A step's grey note under its line, or null. Steps 7 only: the lamp post hint. */
export function practiceNote(key) {
  return PRACTICE_COPY.lines[key]?.note ?? null;
}

/**
 * A step's line in the wording for this input: "touch" on the sheet layout
 * and wherever a finger is the primary pointer (tourWordsFor), else "pointer".
 * `variant` names another line of the step for a state within it, as
 * practiceTargets gives it (`line`): "touchFit" at step 7 on touch once the
 * new box is there (S23 B). A variant the step does not have is ignored.
 */
export function practiceLine(key, words = "pointer", variant = null) {
  const line = PRACTICE_COPY.lines[key];
  if (!line) return "";
  if (variant && line[variant]) return line[variant];
  return (words === "touch" && line.touch) || line.pointer;
}
