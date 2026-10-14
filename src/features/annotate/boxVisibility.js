/**
 * Hiding boxes on the photo in Step 1 (both roles, 8 Oct 2026).
 *
 * When boxes crowd one area it is hard to draw or fit a box exactly, and a
 * press inside an existing box selects it instead of starting a new one. Each
 * object in the list under the photo can be hidden: its box is not drawn and
 * cannot be clicked until it is shown again. From 10 Oct 2026 the open box can
 * also be hidden from its panel, and every box at once with Hide all. Opening a hidden object from the
 * list shows it again. Hiding is a view setting only. Nothing is stored or
 * submitted, and every box shows again in the Sidewalk and Obstructions steps
 * and on the next image.
 */

/** The hidden ids with this id added, or removed if it was hidden. Never mutates. */
export function toggleHiddenId(ids, id) {
  const list = Array.isArray(ids) ? ids : [];
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** The hidden ids without this id. Returns the same array when nothing changes. */
export function withoutHiddenId(ids, id) {
  const list = Array.isArray(ids) ? ids : [];
  return list.includes(id) ? list.filter((x) => x !== id) : list;
}

/**
 * Double-tap to show a hidden box again (14 Oct 2026, a finger in Step 1). A
 * hidden box is not drawn, so the annotator double-taps where it was. Two taps
 * on empty photo make a double tap when the second comes within DOUBLE_TAP_MS
 * of the first and within `reach` of it. Each tap is { at, x, y }, with `at`
 * in ms and x, y in the same units as `reach`.
 */
export const DOUBLE_TAP_MS = 400;

/**
 * @param {{ at: number, x: number, y: number } | null | undefined} previous
 * @param {{ at: number, x: number, y: number } | null | undefined} current
 * @param {{ withinMs?: number, reach?: number }} [options]
 */
export function isDoubleTap(previous, current, { withinMs = DOUBLE_TAP_MS, reach } = {}) {
  if (!previous || !current || !(reach > 0)) return false;
  const elapsed = current.at - previous.at;
  return elapsed >= 0 && elapsed <= withinMs && Math.hypot(current.x - previous.x, current.y - previous.y) <= reach;
}

export const BOX_VISIBILITY_COPY = Object.freeze({
  hide: (label) => `Hide ${label} on the photo`,
  show: (label) => `Show ${label} on the photo`,
  hiddenCount: (n) => (n === 1 ? "1 box hidden" : `${n} boxes hidden`),
  showAll: "Show all",
  // 10 Oct 2026: every box hidden at once, and the open box hidden from its panel
  hideAll: "Hide all",
  hideOpen: "Hide this box on the photo",
});
