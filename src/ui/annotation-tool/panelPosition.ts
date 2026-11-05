/**
 * The floating box panel's width, its usual gap from the box, and the room it
 * keeps above the photo's bottom. The width is the panel card's own
 * (`w-[280px]` in DefaultInputSection and ObjectInputSection). It was 290
 * until S18.
 */
export const PANEL_WIDTH = 280;
export const PANEL_MARGIN = 10;
export const PANEL_ROOM_BELOW = 220;

/**
 * Where the open box's floating panel goes, in the photo's px: `margin` px to
 * the right of the box, or to its left when it would run off the photo on the
 * right and fits on the left. Its top is level with the box's top, but never
 * less than PANEL_ROOM_BELOW px above the photo's bottom. Shared by the tool
 * (syncPanel) and the landing page's preview, so the panel opens in the same
 * place in both.
 *
 * Never outside the photo (S18, 4 Nov 2026): when neither side fits, it goes
 * on the side with more room, and `left` is always clamped to the photo, so
 * the panel may cover part of a wide box (it fades while the box is dragged).
 * Before, it stayed on the right and ran off the photo, where the frame cut
 * it off. `photo.left` is where the photo starts, for a photo letterboxed
 * narrower than the frame (0 by default), and `photo.width` its width from there.
 */
export function panelPosition(
  box: { x: number; y: number; width: number },
  photo: { width: number; height: number; left?: number },
  margin: number = PANEL_MARGIN
) {
  const start = photo.left ?? 0;
  const end = start + photo.width;
  const right = box.x + box.width + margin;
  const left = box.x - PANEL_WIDTH - margin;
  const fitsRight = right + PANEL_WIDTH <= end;
  const fitsLeft = left >= start;
  const roomRight = end - (box.x + box.width);
  const roomLeft = box.x - start;
  const side = fitsRight ? right : fitsLeft ? left : roomRight >= roomLeft ? right : left;
  // From the photo's left edge to the last place the whole panel fits (its left edge when it is narrower)
  const clamped = Math.min(Math.max(side, start), Math.max(start, end - PANEL_WIDTH));
  return { left: clamped, top: Math.max(0, Math.min(box.y, photo.height - PANEL_ROOM_BELOW)) };
}

/**
 * The floating panel's top once its real height is known (16 Oct 2026): moved
 * up just enough that it ends at the photo's bottom, never above the photo's
 * top. panelPosition keeps PANEL_ROOM_BELOW px for the panel, but a panel can
 * be taller (a box answered Yes shows its severity row, a long category wraps
 * the question), and the tool's photo frame clips whatever runs past its
 * bottom. All in the photo's px.
 */
export function fitPanelTop(top: number, panelHeight: number, photoHeight: number) {
  return Math.max(0, Math.min(top, photoHeight - panelHeight));
}
