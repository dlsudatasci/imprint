/**
 * Who can open the annotation tool on which device (9 Oct 2026,
 * IMPRINT_contributor_mobile.md section 6).
 *
 * Contributors can annotate on any device: on phones and tablets the tool has
 * a touch interaction and a sheet layout. Annotators stay on desktops and
 * laptops, as before: their steps (the Sidewalk outline, Obstructions) are
 * built for a mouse or trackpad, so they need a fine pointer and a browser
 * that is not a phone's or tablet's.
 */
export function canAnnotateOn({ isAnnotator = false, finePointer = true, isMobileUA = false } = {}) {
  if (!isAnnotator) return true;
  return finePointer === true && isMobileUA !== true;
}
