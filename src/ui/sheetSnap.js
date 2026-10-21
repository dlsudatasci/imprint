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
 *
 * `compact` is the sheet under the full-screen photo (12 Oct 2026): collapsed
 * is the handle alone, above the home indicator (`inset`), so the photo keeps
 * the screen, and the footer comes up with the sheet. A phone held sideways is
 * about 390 px tall, so there half would show next to nothing between the
 * handle and the footer and goes to full instead, and a box's panel takes the
 * height it needs.
 *
 * From 21 Oct 2026 the sheet never rests higher than its content needs: half
 * and full stop where the content ends, so pulling a short panel or list up
 * leaves no empty space under it. A release lands where its speed carries it
 * (projectRelease, as a scroll view decelerates) and the sheet moves there on
 * a critically damped spring that starts at the finger's speed (springStep).
 */

export const SNAP_ORDER = Object.freeze(["collapsed", "half", "full"]);
/** A release faster than this (px per ms) goes one step in its direction */
export const FLICK_VELOCITY = 0.5;
export const FULL_GAP_PX = 8;
export const HALF_SHARE = 0.5;
export const PANEL_MAX_SHARE = 0.6;
/** Compact: the least of the scrolling part worth stopping at half for, px */
export const MIN_HALF_BODY_PX = 160;
/** The scrolling part's top border, px, which its height includes */
export const BODY_EDGE_PX = 1;
/**
 * How fast a release slows, per ms (Apple's Designing Fluid Interfaces: 0.998
 * is a scroll view's, 0.99 the snappier rate for a sheet). The release lands
 * velocity × rate / (1 − rate) px on, 99 ms worth of its speed.
 */
export const DECELERATION_RATE = 0.99;
/** The spring's response, s: how quickly it reaches its point. No bounce. */
export const SPRING_RESPONSE_S = 0.3;

const nonNegative = (n) => (Number.isFinite(n) && n > 0 ? n : 0);

/** The four resting positions from the measured heights, px. */
export function snapPoints({ container, header, footer, panel = 0, compact = false, inset = 0 }) {
  const c = nonNegative(container);
  // `panel` is the scrolling part's content, px: the open box's panel, or the lists
  const content = nonNegative(panel);
  if (compact) {
    const collapsed = nonNegative(header) + nonNegative(inset);
    // The handle and the footer, which is on the screen once the sheet is up
    const frame = nonNegative(header) + nonNegative(footer);
    // All of the content, and no more (21 Oct 2026); unmeasured, the screen's height
    const fit = content > 0 ? frame + content + BODY_EDGE_PX : Infinity;
    const full = Math.max(collapsed, Math.min(c - FULL_GAP_PX, fit));
    const middle = Math.min(full, Math.max(collapsed, Math.round(c * HALF_SHARE)));
    const half = middle - frame < MIN_HALF_BODY_PX ? full : middle;
    const panelPoint = Math.min(full, Math.max(collapsed, content > 0 ? fit : frame));
    return { collapsed, half, full, panel: panelPoint };
  }
  const collapsed = nonNegative(header) + nonNegative(footer);
  const fit = content > 0 ? collapsed + content + BODY_EDGE_PX : Infinity;
  const full = Math.max(collapsed, Math.min(c - FULL_GAP_PX, fit));
  const half = Math.min(full, Math.max(collapsed, Math.round(c * HALF_SHARE)));
  const panelPoint = Math.min(full, Math.max(collapsed, Math.min(content > 0 ? fit : collapsed, Math.round(c * PANEL_MAX_SHARE))));
  return { collapsed, half, full, panel: panelPoint };
}

/** A position while dragging, held between collapsed and full. */
export function clampSheet(position, points) {
  return Math.min(points.full, Math.max(points.collapsed, position));
}

/** Where a release at this speed (px per ms, positive upwards) comes to rest, as a scroll view slows. */
export function projectRelease(position, velocity) {
  const v = Number.isFinite(velocity) ? velocity : 0;
  return position + (v * DECELERATION_RATE) / (1 - DECELERATION_RATE);
}

/**
 * Where the sheet goes when the finger lifts (21 Oct 2026): the point of
 * `names` nearest where the release would come to rest (projectRelease), so a
 * quick throw carries further than a slow drag. A flick (|velocity| over
 * 0.5 px/ms, positive upwards) always goes at least one step from `from` in
 * its direction, as it did before. Points at the same height count as one.
 */
export function nearestSnap(position, velocity, points, from, names = SNAP_ORDER) {
  const ordered = [...names].sort((a, b) => points[a] - points[b]);
  const nearestTo = (y) =>
    ordered.reduce((best, name, i) => (Math.abs(points[name] - y) < Math.abs(points[ordered[best]] - y) ? i : best), 0);
  let target = nearestTo(projectRelease(position, velocity));
  if (Math.abs(velocity) > FLICK_VELOCITY) {
    let index = ordered.indexOf(from);
    // Not one of these names: start from the point nearest where the drag ended
    if (index < 0) index = nearestTo(position);
    const up = velocity > 0;
    // The next point along that is at a different height
    let step = index;
    while (step + (up ? 1 : -1) >= 0 && step + (up ? 1 : -1) < ordered.length) {
      step += up ? 1 : -1;
      if (points[ordered[step]] !== points[ordered[index]]) break;
    }
    if (up ? points[ordered[target]] < points[ordered[step]] : points[ordered[target]] > points[ordered[step]]) target = step;
  }
  return ordered[target];
}

/**
 * One step of a critically damped spring (21 Oct 2026): `displacement` from
 * its point, px, and `velocity`, px per s, after `dt` s. Exact, so the step
 * size does not change the path. No overshoot: a sheet that went past its
 * point would open a gap above the footer.
 */
export function springStep(displacement, velocity, dt, response = SPRING_RESPONSE_S) {
  const w = (2 * Math.PI) / response;
  const e = Math.exp(-w * dt);
  const b = velocity + w * displacement;
  return { x: (displacement + b * dt) * e, v: (velocity - w * b * dt) * e };
}
