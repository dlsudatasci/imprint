/**
 * Moving between a session's images from the progress strip (6 Nov 2026).
 *
 * The strip asks, and the annotation tool moves: only the tool knows whether
 * the image on screen has changes the server does not have yet. An image
 * already sent and changed since is sent again first, so going back and
 * jumping forward never leaves a change only in this browser. The tutorial
 * goes the same way, against its mocked endpoints.
 */

/** The window event the strip sends, with the image to open (1-based) as its detail */
export const GO_TO_IMAGE_EVENT = "imprint:go-to-image";

/** Asks the annotation tool to open image `target` (1-based). */
export function requestImage(target) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GO_TO_IMAGE_EVENT, { detail: target }));
}

const round = (n) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

/**
 * A short text that is the same exactly when the answers on an image are the
 * same: every answered or drawn box (its category, place and answers) and,
 * where they are asked, Step 2's answers and the sidewalk outline. Box order
 * does not count (the tool reorders boxes on every click), nor do suggestions
 * not answered yet, which are never sent.
 */
export function answerSignature({ boxes = [], scene = null, mask = null } = {}) {
  const answered = (Array.isArray(boxes) ? boxes : [])
    .filter((b) => b && (b.editable || b.selected || b.isRejected))
    .map((b) => [
      String(b.id),
      Boolean(b.editable),
      b.comment ?? null,
      b.mark ? [round(b.mark.x), round(b.mark.y), round(b.mark.width), round(b.mark.height)] : null,
      Boolean(b.selected),
      Boolean(b.isRejected),
      b.obstructs ?? null,
      b.severity ?? null,
      b.onSidewalk ?? null,
    ])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify({ boxes: answered, scene: scene ?? null, mask: mask ?? null });
}

/**
 * What leaving an image takes (6 Nov 2026):
 *   "stay"   nowhere to go: the image on screen, outside the session, or past the furthest reached
 *   "send"   an image already sent, changed since: send it again, then go
 *   "finish" the same for an annotator, whose image is sent from its last step: they finish it first
 *   "go"     nothing to send: go at once
 * `current` and `target` are 1-based, `reached` the furthest image reached.
 */
export function leaveAction({ current, target, reached, total, changed, isAnnotator = false }) {
  if (!Number.isInteger(target) || target < 1 || target === current) return "stay";
  if (Number.isInteger(total) && total > 0 && target > total) return "stay";
  if (target > Math.max(current, reached ?? current)) return "stay";
  // Images before the furthest reached were all sent
  const sent = current < (reached ?? current);
  if (sent && changed) return isAnnotator ? "finish" : "send";
  return "go";
}

/** Said to an annotator who leaves a sent image with changes (no em dashes, no semicolons) */
export const FINISH_BEFORE_LEAVING = "You changed this photo. Go through its steps to Next Image to save the changes, then move to another photo.";
