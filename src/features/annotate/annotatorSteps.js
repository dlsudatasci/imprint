/**
 * The annotator's steps on one image, one per model (chapter_4.tex line 54,
 * decided 4 Oct 2026): Objects for the detector, Sidewalk for the segmentation
 * model, Obstructions for the classifier.
 *
 * All three are enabled (Sidewalk from 6 Oct 2026), but only model-development
 * images get the Sidewalk step. Reference images are never used to train, tune
 * or test a model, so they keep two steps. annotatorStepsFor({ askSidewalk })
 * gives the list for one image, and the helpers take it as their optional last
 * argument: "Step 2 of 3: Sidewalk" on a model-development image, "Step 2 of 2:
 * Obstructions" on a reference image.
 */
/** @typedef {{ key: string, title: string, enabled: boolean }} AnnotatorStepEntry */

/** @type {ReadonlyArray<Readonly<AnnotatorStepEntry>>} */
export const ANNOTATOR_STEPS = Object.freeze([
  Object.freeze({ key: "objects", title: "Objects", enabled: true }),
  Object.freeze({ key: "sidewalk", title: "Sidewalk", enabled: true }),
  Object.freeze({ key: "obstructions", title: "Obstructions", enabled: true }),
]);

/**
 * The steps for one image: Sidewalk only when the image needs an outline. A new frozen list.
 * @returns {ReadonlyArray<Readonly<AnnotatorStepEntry>>}
 */
export function annotatorStepsFor({ askSidewalk }) {
  return Object.freeze(
    ANNOTATOR_STEPS.map((step) =>
      step.key === "sidewalk" ? Object.freeze({ ...step, enabled: askSidewalk === true }) : step
    )
  );
}

export function enabledAnnotatorSteps(steps = ANNOTATOR_STEPS) {
  return steps.filter((step) => step.enabled);
}

function enabledIndex(key, steps) {
  const enabled = enabledAnnotatorSteps(steps);
  const index = enabled.findIndex((step) => step.key === key);
  if (index === -1) throw new Error(`Unknown or disabled annotator step: ${key}`);
  return { enabled, index };
}

export function annotatorStepHeading(key, steps = ANNOTATOR_STEPS) {
  const { enabled, index } = enabledIndex(key, steps);
  return `Step ${index + 1} of ${enabled.length}: ${enabled[index].title}`;
}

export function nextAnnotatorStep(key, steps = ANNOTATOR_STEPS) {
  const { enabled, index } = enabledIndex(key, steps);
  return enabled[index + 1]?.key ?? null;
}

export function previousAnnotatorStep(key, steps = ANNOTATOR_STEPS) {
  const { enabled, index } = enabledIndex(key, steps);
  return enabled[index - 1]?.key ?? null;
}
