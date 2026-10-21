import { isDecidedForObjects } from "@/util/suggestionJudgment";
import { isTaxonomyCategory } from "@/util/taxonomy";
import { realObjects } from "@/features/annotate/obstructionStep";
import { validateSidewalkMask } from "@/util/validators/sidewalkMask";

/** The ids of these boxes, for the tool to open the first one still to fix (21 Oct 2026) */
const idsOf = (boxes) => boxes.map((box) => box?.id).filter((id) => id != null);

/**
 * The annotator's Objects step (decided 4 Oct 2026): every suggestion is kept
 * or marked Not an object, and every kept or drawn box has one of the 18
 * categories. Everything can be checked from existingAnnotations, which holds
 * every box on the canvas. `words` is "touch" on a phone or tablet, where the
 * message says tap (12 Oct 2026).
 *
 * A failure also lists the boxes it is about (`boxIds`, 21 Oct 2026), so the
 * tool opens one of them for the annotator to finish.
 */
export function validateObjectStep(existingAnnotations, { words = "pointer" } = {}) {
  const boxes = existingAnnotations || [];
  const undecided = boxes.filter((box) => !box.editable && !isDecidedForObjects(box));
  if (undecided.length > 0) {
    return {
      valid: false,
      error: `Please ${words === "touch" ? "tap" : "click"} Keep or Not an object on every suggested box.`,
      boxIds: idsOf(undecided),
    };
  }
  const real = boxes.filter((box) => box.editable || box.selected === true);
  const unlabeled = real.filter((box) => !isTaxonomyCategory(box.comment));
  if (unlabeled.length > 0) {
    return { valid: false, error: "Please choose a category from the list for every box.", boxIds: idsOf(unlabeled) };
  }
  return { valid: true };
}

/**
 * The annotator's Obstructions step (decided 4 Oct 2026): unmarked objects
 * become "does not obstruct" only after the annotator confirms it, so a "No"
 * is never recorded by default (the principle of chapter_4.tex line 182).
 * An image with no real objects has nothing to confirm.
 */
export function validateObstructionStep({ annotations, confirmed }) {
  if (realObjects(annotations).length === 0) return { valid: true };
  if (confirmed !== true) {
    return {
      valid: false,
      error: "Please tick the box to confirm that the objects you did not mark do not obstruct the sidewalk.",
    };
  }
  return { valid: true };
}

/**
 * The annotator's Sidewalk step (6 Oct 2026), on model-development images only.
 * A half-drawn shape must be finished or cancelled, then the outline must pass
 * validateSidewalkMask (at least one walking space shape, or No sidewalk).
 */
export function validateSidewalkStep({ askSidewalk, mask, hasDraft, imageWidth, imageHeight }) {
  if (!askSidewalk) return { valid: true };
  if (hasDraft) return { valid: false, error: "Finish or cancel the shape you are drawing." };
  const result = validateSidewalkMask(mask, imageWidth, imageHeight);
  return result.valid ? { valid: true } : { valid: false, error: result.message };
}

/**
 * Every check before an image is sent. A contributor's failure names the part
 * of the screen to show (9 Oct 2026): "objects" for a box (the answers at the
 * bottom of the screen on a phone) or "scene" for Step 2. A failure about
 * boxes lists them too (`boxIds`, 21 Oct 2026): the tool opens the first one.
 */
export function validateAnnotationForSubmit({
  existingAnnotations,
  newObjects,
  selectedObjects,
  sceneLevel,
  isAnnotator = false,
  obstructionsConfirmed = false,
  askSidewalk = false,
  sidewalkMask = null,
  sidewalkDraftOpen = false,
  imageWidth,
  imageHeight,
  words = "pointer",
}) {
  if (isAnnotator) {
    const objects = validateObjectStep(existingAnnotations, { words });
    if (!objects.valid) return objects;
    const sidewalk = validateSidewalkStep({
      askSidewalk,
      mask: sidewalkMask,
      hasDraft: sidewalkDraftOpen,
      imageWidth,
      imageHeight,
    });
    if (!sidewalk.valid) return sidewalk;
    return validateObstructionStep({ annotations: existingAnnotations, confirmed: obstructionsConfirmed });
  }

  const unconfirmed = (existingAnnotations || []).filter(
    (el) => !el.editable && !el.selected && !el.isRejected
  );

  if (unconfirmed.length > 0) {
    return { valid: false, section: "objects", error: "Please answer Yes or No for every object before submitting.", boxIds: idsOf(unconfirmed) };
  }

  const objectsToValidate = [...(newObjects || []), ...(selectedObjects || [])];
  const unlabeled = objectsToValidate.filter((object) => !object.comment || object.comment === "---");
  if (unlabeled.length > 0) {
    return {
      valid: false,
      section: "objects",
      error: "You have an unlabeled object. Please select a label for all the boxes.",
      boxIds: idsOf(unlabeled),
    };
  }

  const confirmedExisting = (existingAnnotations || []).filter(
    (el) => !el.editable && !el.isRejected
  );
  const allBoxes = [...confirmedExisting, ...(newObjects || [])];
  const unanswered = (object) => object.obstructs === undefined || object.obstructs === null;
  const unrated = (object) => object.obstructs === true && (object.severity === undefined || object.severity === null);
  // The first box failing either check decides the message, as before; the
  // boxes listed are every one failing that same check
  const first = allBoxes.find((object) => unanswered(object) || unrated(object));
  if (first) {
    if (unanswered(first)) {
      return { valid: false, section: "objects", error: "Please indicate whether each object obstructs the sidewalk.", boxIds: idsOf(allBoxes.filter(unanswered)) };
    }
    return { valid: false, section: "objects", error: "Please rate the severity of each obstruction (1–5).", boxIds: idsOf(allBoxes.filter(unrated)) };
  }

  if (!sceneLevel || !sceneLevel.sidewalkWidth) {
    return { valid: false, section: "scene", error: "Please select the sidewalk width category." };
  }
  // With no sidewalk the other three questions are greyed out and left empty
  // (decided 2 Oct 2026), so they are only required when a sidewalk is present.
  if (sceneLevel.sidewalkWidth !== "no_sidewalk") {
    if (sceneLevel.surfaceCondition === null || sceneLevel.surfaceCondition === undefined) {
      return { valid: false, section: "scene", error: "Please rate the surface condition." };
    }
    if (sceneLevel.walkability === null || sceneLevel.walkability === undefined) {
      return { valid: false, section: "scene", error: "Please rate the walking comfort." };
    }
    if (sceneLevel.overallAccessibility === null || sceneLevel.overallAccessibility === undefined) {
      return { valid: false, section: "scene", error: "Please rate accessibility." };
    }
  }

  return { valid: true };
}
