import { NOT_AN_OBJECT } from "@/util/suggestionJudgment";

/**
 * The obstruction classifier's proposal as a hint (S3, decided 25 Oct 2026 by
 * Rans and the adviser). scripts/update-predictions.mjs writes it onto each
 * suggestion of the image record: `proposedObstructs` (true or false, already
 * at the calibrated threshold, D18) and `obstructionProbability` (0 to 1).
 * Before the first trained classifier, suggestions have neither field, and
 * that is the switch: no setting and no flag.
 *
 * Only a proposal that the object obstructs is shown (decided 6 Nov 2026,
 * after the first S3 build showed both): the hint shows for a suggestion
 * exactly when its record's `proposedObstructs` is true. A proposal of false
 * shows nothing, as no proposal does, but is still stored and logged.
 *
 * The hint is never a pre-selected answer (pipeline_methodology.md §7t). It
 * shows only on Question 2, "Does {label} obstruct the sidewalk?", so only for
 * a contributor's suggestion answered Yes to Question 1. The probability is
 * never shown, only the Yes or No. With only a path (S15, Step 1 answered
 * No) there is no Question 1: the one question, "Does {label} obstruct the
 * path?", carries the hint, worded for the path.
 */

/** The panel's line, and the tutorial's sentence. No em dashes, no semicolons. */
export const PROPOSAL_HINT_COPY = Object.freeze({
  obstructs: "The model thinks this obstructs the sidewalk.",
  // Only a path (S15): the obstruction question is about the path
  obstructsPath: "The model thinks this obstructs the path.",
  /**
   * The guide's answer step and the tour's Check Each Box, right after the
   * obstruction question, shown whether or not proposals exist yet
   */
  tutorial: "Sometimes, you will see what the model thinks. It can be wrong, so answer for you and from what you can see in the photo.",
});

/** True when the value is a proposal: true or false, nothing else. */
export const isProposal = (value) => typeof value === "boolean";

/** True when the hint is shown for this proposal: only one that the object obstructs. */
export const isShownProposal = (value) => value === true;

/** The panel's line for a proposal, or null when nothing is shown (false, or none). */
export function proposalHintText(proposedObstructs, { pathOnly = false } = {}) {
  if (!isShownProposal(proposedObstructs)) return null;
  return pathOnly ? PROPOSAL_HINT_COPY.obstructsPath : PROPOSAL_HINT_COPY.obstructs;
}

/** A record suggestion's probability, or null when it has none. */
export function recordProbability(entry) {
  const p = entry?.obstructionProbability;
  return typeof p === "number" && Number.isFinite(p) ? p : null;
}

/**
 * Whether the hint was on screen for a submitted box: the record's suggestion
 * proposes that it obstructs, and the box answered Question 1 Yes
 * (`onSidewalk === true`), so Question 2 and its hint were shown. False for a
 * box off the path, a box marked Not an object (no sidewalk answer), a drawn
 * box (no record entry), a suggestion whose proposal is false or missing,
 * and every annotator's box.
 *
 * With only a path (S15, `hasSidewalk: false`) a box is asked one question,
 * whether it obstructs the path, and the hint is on it, so the hint was
 * shown for every suggestion proposed to obstruct that is not marked Not an
 * object. A sidewalk (`hasSidewalk` true, the default) keeps the rule above.
 *
 * `recordEntry` is always the image record's suggestion, never the request's.
 */
export function proposalWasShown(recordEntry, submittedBox, { isAnnotator = false, hasSidewalk = true } = {}) {
  if (isAnnotator) return false;
  if (!isShownProposal(recordEntry?.proposedObstructs) || !submittedBox) return false;
  if (hasSidewalk === false) return submittedBox.comment !== NOT_AN_OBJECT;
  return submittedBox.onSidewalk === true;
}
