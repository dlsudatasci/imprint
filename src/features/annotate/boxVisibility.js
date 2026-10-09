/**
 * Hiding boxes on the photo in Step 1 (both roles, 8 Oct 2026).
 *
 * When boxes crowd one area it is hard to draw or fit a box exactly, and a
 * press inside an existing box selects it instead of starting a new one. Each
 * object in the list under the photo can be hidden: its box is not drawn and
 * cannot be clicked until it is shown again. Opening a hidden object from the
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

export const BOX_VISIBILITY_COPY = Object.freeze({
  hide: (label) => `Hide ${label} on the photo`,
  show: (label) => `Show ${label} on the photo`,
  hiddenCount: (n) => (n === 1 ? "1 box hidden" : `${n} boxes hidden`),
  showAll: "Show all",
});
