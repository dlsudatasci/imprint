/**
 * The tutorial's length and version, by role (S30, 14 Nov 2026).
 *
 * Contributors' tutorial is one photo from S30: the practice on photo 1
 * (S19). Photos 2 and 3 were left out after participants found the tutorial
 * long and technical. That is version 2. Contributors who finished before it
 * did version 1, three photos, and have no `tutorialVersion` on their account
 * (the exports read a missing one as 1). Annotators keep their three photos
 * and the tour on each, version 1.
 *
 * completeTutorial stores the version with the date of the first completion,
 * so the analysis can use it as a covariate.
 */
export const TUTORIAL_IMAGE_COUNTS = Object.freeze({ contributor: 1, annotator: 3 });
export const TUTORIAL_VERSIONS = Object.freeze({ contributor: 2, annotator: 1 });

/** How many photos the tutorial has for this role */
export function tutorialImageCount(isAnnotator = false) {
  return isAnnotator ? TUTORIAL_IMAGE_COUNTS.annotator : TUTORIAL_IMAGE_COUNTS.contributor;
}

/** The version of the tutorial this role does now */
export function tutorialVersionFor(isAnnotator = false) {
  return isAnnotator ? TUTORIAL_VERSIONS.annotator : TUTORIAL_VERSIONS.contributor;
}

/** The submit button's label on the tutorial's last photo, both roles */
export const FINISH_TUTORIAL_LABEL = "Finish Tutorial";
