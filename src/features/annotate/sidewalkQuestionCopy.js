/**
 * Contributor Step 1: the question asked before the obstruction question
 * (S12, decided 23 Oct 2026, wording by Rans on 2 Nov 2026). Every piece of
 * its wording lives here and nowhere else, so a change of wording, if the
 * adviser asks for one, is a change to this file only.
 *
 * "Or the path people walk on": about one photo in ten has no sidewalk, and
 * people walk along the edge of the road. With "sidewalk" alone, no object in
 * those photos could ever obstruct. The stored field is still `onSidewalk`.
 */
export const SIDEWALK_QUESTION_COPY = Object.freeze({
  /** The question in the box panel, desktop, phone and tablet alike, answered Yes or No */
  question: "Is it on the sidewalk or the path people walk on?",
  /** Next Image with a box whose sidewalk answer is missing */
  incomplete: "Please say whether each object is on the sidewalk or the path people walk on.",
  /** The tour's line on streets with no sidewalk */
  tutorial: "Some streets have no sidewalk. There, the path people walk on is usually the edge of the road. Answer Yes if the object is on that path.",
});
