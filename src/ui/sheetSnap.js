/**
 * Where the answers sheet rests on phones and tablets (contributors, 9 Oct
 * 2026, IMPRINT_contributor_mobile.md section 4.4). Pure: BottomSheet passes
 * the heights it measured. A position is the sheet's visible height in px,
 * footer included.
 *
 *   collapsed  the header (handle and the answers at a glance) and the footer
 *   half       half the screen below the top bar
 *   full       all of it but 8 px, so the top bar's edge still shows
 *   panel      while a box is open: its panel and the footer, at most 60%
 */

export const SNAP_ORDER = Object.freeze(["collapsed", "half", "full"]);
/** A release faster than this (px per ms) goes one step in its direction */
export const FLICK_VELOCITY = 0.5;
export const FULL_GAP_PX = 8;
export const HALF_SHARE = 0.5;
export const PANEL_MAX_SHARE = 0.6;

const nonNegative = (n) => (Number.isFinite(n) && n > 0 ? n : 0);

/** The four resting positions from the measured heights, px. */
export function snapPoints({ container, header, footer, panel = 0 }) {
  const c = nonNegative(container);
  const collapsed = nonNegative(header) + nonNegative(footer);
  const full = Math.max(collapsed, c - FULL_GAP_PX);
  const half = Math.min(full, Math.max(collapsed, Math.round(c * HALF_SHARE)));
  const panelPoint = Math.min(full, Math.max(collapsed, Math.min(collapsed + nonNegative(panel), Math.round(c * PANEL_MAX_SHARE))));
  return { collapsed, half, full, panel: panelPoint };
}

/** A position while dragging, held between collapsed and full. */
export function clampSheet(position, points) {
  return Math.min(points.full, Math.max(points.collapsed, position));
}

/**
 * Where the sheet goes when the finger lifts: the nearest of `names`, or, on a
 * flick (|velocity| over 0.5 px/ms, positive upwards), one step from `from` in
 * the flick's direction.
 */
export function nearestSnap(position, velocity, points, from, names = SNAP_ORDER) {
  const ordered = [...names].sort((a, b) => points[a] - points[b]);
  if (Math.abs(velocity) > FLICK_VELOCITY) {
    let index = ordered.indexOf(from);
    if (index < 0) {
      // Start from the nearest point to where the drag began
      index = ordered.reduce((best, name, i) => (Math.abs(points[name] - position) < Math.abs(points[ordered[best]] - position) ? i : best), 0);
    }
    const step = velocity > 0 ? 1 : -1;
    return ordered[Math.min(ordered.length - 1, Math.max(0, index + step))];
  }
  return ordered.reduce((best, name) => (Math.abs(points[name] - position) < Math.abs(points[best] - position) ? name : best), ordered[0]);
}
