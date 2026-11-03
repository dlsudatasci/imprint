/**
 * Contributor Step 1: the question asked before the obstruction question
 * (S12, decided 23 Oct 2026, wording by Rans on 2 Nov 2026). Every piece of
 * its wording lives here and nowhere else, so a change of wording, if the
 * adviser asks for one, is a change to this file only.
 *
 * "Or the path people walk on": about one photo in ten has no sidewalk, and
 * people walk along the edge of the road. With "sidewalk" alone, no object in
 * those photos could ever obstruct. The stored field is still `onSidewalk`.
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
  question: "Is it on the sidewalk or the path people walk on?",
  /** Next Image with a box whose sidewalk answer is missing */
  incomplete: "Please say whether each object is on the sidewalk or the path people walk on.",
  /**
   * What counts as the path (S16, 3 Nov 2026), in the tour's "What Counts as
   * the Path" step and the guide. Replaced the one-sentence `tutorial`.
   */
  pathPoints: Object.freeze([
    "The path is the sidewalk, or any paved path made for walking.",
    "No sidewalk in the photo? The path is the edge of the road people walk along.",
    "More than one sidewalk? Only the one nearest you counts. Answer No for objects on a farther one.",
  ]),
  /** The line above each question in a contributor's box panel (S16): "Question 1 of 2" */
  questionOf: (n) => `Question ${n} of 2`,
  /**
   * The way back to an earlier question at the foot of the panel (S17,
   * 4 Nov 2026): "Back to Question 1" on Question 2, "Back to Question 2" on
   * a confirmed obstruction's severity. Nothing changes until a new answer is picked.
   */
  backTo: (n) => `Back to Question ${n}`,
});
