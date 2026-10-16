/** The floating box panel's width, its usual gap from the box, and the room it keeps above the photo's bottom */
export const PANEL_WIDTH = 290;
export const PANEL_MARGIN = 10;
export const PANEL_ROOM_BELOW = 220;

/**
 * Where the open box's floating panel goes, in the photo's px: `margin` px to
 * the right of the box, or to its left when it would run off the photo on the
 * right and fits on the left. Its top is level with the box's top, but never
 * less than PANEL_ROOM_BELOW px above the photo's bottom. Shared by the tool
 * (syncPanel) and the landing page's preview, so the panel opens in the same
 * place in both.
 */
export function panelPosition(
  box: { x: number; y: number; width: number },
  photo: { width: number; height: number },
  margin: number = PANEL_MARGIN
) {
  const right = box.x + box.width + margin;
  const left = box.x - PANEL_WIDTH - margin;
  const useLeft = right + PANEL_WIDTH > photo.width && left >= 0;
  return { left: useLeft ? left : right, top: Math.max(0, Math.min(box.y, photo.height - PANEL_ROOM_BELOW)) };
}

