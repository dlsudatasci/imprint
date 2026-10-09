import { NOT_AN_OBJECT } from "@/util/suggestionJudgment";
import { formatLabel } from "@/util/buildDisplayLabels";

/**
 * Contributor Step 1: the lists of answers under the photo (7 Oct 2026,
 * contributors only).
 *
 * Every object sits in exactly one place: still to decide, Not obstructions
 * (answered No), Obstructions (answered Yes), or Not an object. Suggestions and
 * boxes the contributor drew share the lists, and drawn boxes are marked as
 * drawn. Before this, a suggestion answered No was listed nowhere, and a drawn
 * box sat under "Your Drawn Obstructions" even when answered No.
 *
 * Pure logic for ObjectTrays.tsx: which list each box belongs to, the lists,
 * and every string they show. Nothing stored or submitted changes.
 */

export const TRAYS = Object.freeze({
  toDecide: "toDecide",
  notObstructions: "notObstructions",
  obstructions: "obstructions",
  removed: "removed",
});

const FALLBACK_LABEL = "Select a category";

export const TRAY_COPY = Object.freeze({
  stepHint: "Your answers are listed below the photo.",
  toDecideTitle: "Still to decide",
  allAnswered: "Every object is answered.",
  noObjects: "No suggestions in this image. Draw a box around any object the model missed.",
  notObstructions: "Not obstructions",
  obstructions: "Obstructions",
  removed: "Not an object",
  drawnTitle: "Drawn by you",
  fallbackLabel: FALLBACK_LABEL,
});

/**
 * Which list a box belongs to. Suggestions use the same states as
 * validateAnnotationForSubmit (undecided is not editable, not selected and not
 * rejected). Drawn boxes go by their Yes or No answer. null for anything that
 * is not a box.
 */
export function trayOf(box) {
  if (box == null || typeof box !== "object") return null;
  if (!box.editable) {
    if (box.comment === NOT_AN_OBJECT) return TRAYS.removed;
    if (box.selected === true) return TRAYS.obstructions;
    if (box.isRejected === true) return TRAYS.notObstructions;
    return TRAYS.toDecide;
  }
  if (box.obstructs === true) return TRAYS.obstructions;
  if (box.obstructs === false) return TRAYS.notObstructions;
  return TRAYS.toDecide;
}

/**
 * The lists for a set of boxes, in the order given (the caller passes them
 * sorted by id). Each item is { id, label, drawn }. total counts every box
 * except those marked Not an object, and answered counts the two answer lists.
 * Does not mutate the boxes.
 *
 * @param {Array<object> | null | undefined} boxes
 * @param {{ labels?: Map<string, string | null> }} [options]
 */
export function buildTrays(boxes, { labels } = {}) {
  const trays = { toDecide: [], notObstructions: [], obstructions: [], removed: [] };
  for (const box of boxes || []) {
    const tray = trayOf(box);
    if (!tray) continue;
    // Under the "Not an object" heading a box is named by the model's own
    // category ("Car"), since its current label only repeats the heading
    const original = box.initialState?.comment;
    const removedLabel = tray === TRAYS.removed && original && original !== NOT_AN_OBJECT ? formatLabel(original) : null;
    trays[tray].push({
      id: box.id,
      label: removedLabel || labels?.get(box.id) || formatLabel(box.comment) || FALLBACK_LABEL,
      drawn: box.editable === true,
    });
  }
  const answered = trays.notObstructions.length + trays.obstructions.length;
  return { ...trays, total: answered + trays.toDecide.length, answered };
}

/**
 * Empty slots after a list's chips, so each list shows that answers will go
 * there: three while it is empty, one once it has chips, none when nothing is
 * left to decide.
 */
export function ghostSlotCount(itemCount, toDecideCount) {
  if (!toDecideCount) return 0;
  return itemCount === 0 ? 3 : 1;
}
