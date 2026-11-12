/**
 * Contributor Step 2: the question asked before the obstruction question
 * (S12, decided 23 Oct 2026, wording by Rans on 2 Nov 2026). From S15 (9 Nov
 * 2026) it is asked only when Step 1 says there is a sidewalk. With only a
 * path each box is asked one question, whether it obstructs the path
 * (pathQuestion), with no step line and no way back to Question 1. Every piece of
 * its wording lives here and nowhere else, so a change of wording, if the
 * adviser asks for one, is a change to this file only.
 *
 * From 13 Nov 2026 the question is "Is it on the sidewalk?". From 2 to
 * 12 Nov 2026 it was "Is it on the sidewalk or the path people walk on?",
 * written (S12) before Step 1 existed so that objects in photos with no
 * sidewalk, about one in ten, could still obstruct. Since S15 those photos
 * never reach this question (pathQuestion asks them instead), so it is only
 * asked once Step 1 says there is a sidewalk, and on such a photo only the
 * sidewalk counts: an object on the road edge beside it is answered No. The
 * stored field is still `onSidewalk`, unchanged.
 *
 * With two sidewalks in view only the nearest counts (Rans, 3 Nov 2026, S16):
 * the one a person standing where the photo was taken would walk on. Objects
 * on a farther sidewalk are answered No. The far side is too distant and too
 * often hidden to judge. pathPoints says so, and the tour and the guide read
 * it from here. Step 1's instructions above the photo say it in their own
 * words (Rans, 3 Nov 2026).
 */
export const SIDEWALK_QUESTION_COPY = Object.freeze({
  /** The question in the box panel, desktop, phone and tablet alike, answered Yes or No */
  question: "Is it on the sidewalk?",
  /** Next Image with a box whose sidewalk answer is missing */
  incomplete: "Please say whether each object is on the sidewalk.",
  /**
   * What counts as the path (S16, 3 Nov 2026), in the tour's "What Counts as
   * the Path" step and the guide. Replaced the one-sentence `tutorial`.
   */
  pathPoints: Object.freeze([
    "The path is the sidewalk, or any paved path made for walking.",
    "No sidewalk in the photo? The path is the edge of the road people walk along.",
    "More than one sidewalk? Only the one nearest you counts. Answer No for objects on a farther one.",
  ]),
  /**
   * The path question as the tour's Check Each Box says it (Rans, 5 Nov 2026):
   * an instruction rather than the question quoted.
   */
  answerWhether: "Answer whether it's on the sidewalk.",
  /** The line above each question in a contributor's box panel (S16): "Question 1 of 2" */
  questionOf: (n) => `Question ${n} of 2`,
  /**
   * The way back to an earlier question at the foot of the panel (S17,
   * 4 Nov 2026): "Back to Question 1" on Question 2, "Back to Question 2" on
   * a confirmed obstruction's severity. Nothing changes until a new answer is picked.
   */
  backTo: (n) => `Back to Question ${n}`,
  /**
   * Only a path (S15): the one question, the label in bold put in by the
   * panel between the two parts, "Does {label} obstruct the path?"
   */
  pathQuestion: Object.freeze({ before: "Does ", after: " obstruct the path?" }),
  /** Only a path: a confirmed obstruction's severity panel, back to its one question */
  backToQuestion: "Back to the question",
  /** A box opened, drawn or added before Step 1 is answered (S15) */
  firstStep1: "First, answer Step 1: is there a sidewalk?",
  /** Step 1 changed after boxes were answered, and some go back to Still to decide (S15) */
  boxesReset: "Some boxes need answering again.",
});
