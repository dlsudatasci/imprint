/**
 * Where the practice's card goes (S19, 7 Nov 2026): beside what the step
 * points at and never over it, and inside the screen at every size, from a
 * 320 px phone to a 1920 px laptop. Pure, so it is tested without a browser.
 *
 * `targets` are the rectangles the step points at (the outline on the photo,
 * the ringed controls), `avoid` what the card should also keep clear of if it
 * can (the box panel on a laptop). Rectangles are { left, top, width, height }
 * in CSS px of the viewport.
 *
 * The card is tried below, above, right and left of the targets (right and
 * left first on a laptop, where the photo is wide), then of each thing to
 * avoid (on a phone, just above the answers sheet), then of the targets with
 * what to avoid, then along the top and bottom of the screen. Each place is
 * moved inside the screen first. The first place that covers no target and
 * the least of what to avoid wins. If every place covers a target, the one
 * covering the least of them does. With `near` (a rectangle) the card is kept
 * next to it first: above it, then beside it, then below it, the first of
 * those covering no target (on touch at step 6: the Add box button, then the
 * white post, 8 Nov 2026).
 */

/** The card's distance from the screen's edges, and from its target */
export const CARD_MARGIN = 8;
export const CARD_GAP = 12;

const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);

function overlap(a, b) {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/** The smallest rectangle holding all of these, or null for none */
export function unionRect(rects) {
  const list = (rects ?? []).filter((r) => r && area(r) > 0);
  if (list.length === 0) return null;
  const left = Math.min(...list.map((r) => r.left));
  const top = Math.min(...list.map((r) => r.top));
  const right = Math.max(...list.map((r) => r.left + r.width));
  const bottom = Math.max(...list.map((r) => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

function around(block, card, gap) {
  const centerX = block.left + block.width / 2 - card.width / 2;
  const centerY = block.top + block.height / 2 - card.height / 2;
  return {
    below: { left: centerX, top: block.top + block.height + gap },
    above: { left: centerX, top: block.top - gap - card.height },
    right: { left: block.left + block.width + gap, top: centerY },
    left: { left: block.left - gap - card.width, top: centerY },
  };
}

/**
 * The card's top-left corner, { left, top, side }, for a card of this size.
 * `prefer` is "side" on a laptop (right and left first) or "vertical" on a
 * phone or tablet (below and above first).
 */
export function placeCard({ targets = [], avoid = [], card, viewport, prefer = "vertical", margin = CARD_MARGIN, gap = CARD_GAP, near = null }) {
  const inside = ({ left, top }) => ({
    left: clamp(left, margin, viewport.width - card.width - margin),
    top: clamp(top, margin, viewport.height - card.height - margin),
  });
  const order = prefer === "side" ? ["right", "left", "below", "above"] : ["below", "above", "right", "left"];
  const blocks = [unionRect(targets), ...avoid, unionRect([...targets, ...avoid])].filter((b) => b && area(b) > 0);
  const candidates = [];
  // Kept next to `near`: above it, beside it, below it. Taken whenever it
  // covers no target, whatever else it covers.
  if (near && area(near) > 0) {
    const spots = around(near, card, gap);
    for (const side of ["above", "right", "left", "below"]) candidates.push({ side, preferred: true, ...inside(spots[side]) });
  }
  for (const block of blocks) {
    const spots = around(block, card, gap);
    for (const side of order) candidates.push({ side, ...inside(spots[side]) });
  }
  // Along the top and the bottom of the screen, centred
  const centred = (viewport.width - card.width) / 2;
  candidates.push({ side: "top", ...inside({ left: centred, top: margin }) });
  candidates.push({ side: "bottom", ...inside({ left: centred, top: viewport.height - card.height - margin }) });

  let best = null;
  for (const spot of candidates) {
    const rect = { left: spot.left, top: spot.top, width: card.width, height: card.height };
    const onTargets = targets.reduce((sum, t) => sum + overlap(rect, t), 0);
    const onAvoid = avoid.reduce((sum, t) => sum + overlap(rect, t), 0);
    const score = onTargets * 1e6 + onAvoid;
    if (spot.preferred && onTargets === 0) {
      best = { ...spot, score };
      break;
    }
    if (!best || score < best.score) best = { ...spot, score };
    if (score === 0) break;
  }
  return { left: Math.round(best.left), top: Math.round(best.top), side: best.side };
}

/** Whether the card at this place covers any target */
export function coversTarget(place, card, targets) {
  const rect = { left: place.left, top: place.top, width: card.width, height: card.height };
  return targets.some((t) => overlap(rect, t) > 0);
}

/** The lit parts' margin and corner radius, CSS px, as the tour's spotlight */
export const SPOTLIGHT_PAD = 6;
export const SPOTLIGHT_RADIUS = 10;

function roundedRect({ left, top, width, height }, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const right = left + width;
  const bottom = top + height;
  return `M${left + r} ${top}H${right - r}A${r} ${r} 0 0 1 ${right} ${top + r}V${bottom - r}A${r} ${r} 0 0 1 ${right - r} ${bottom}H${left + r}A${r} ${r} 0 0 1 ${left} ${bottom - r}V${top + r}A${r} ${r} 0 0 1 ${left + r} ${top}Z`;
}

const overlaps = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
const bounds = (a, b) => {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  return { left, top, width: Math.max(a.left + a.width, b.left + b.width) - left, height: Math.max(a.top + a.height, b.top + b.height) - top };
};

/**
 * The dimmed overlay over the page (8 Nov 2026, the tour's look): one path
 * covering `width` by `height`, with a rounded cut-out around each lit part,
 * filled even-odd so the cut-outs stay clear and let presses through. Parts
 * that overlap once padded are cut out as one, around both: even-odd fills
 * where two cut-outs cross back in, which darkened the white post and a
 * corner of the new box beside it on a phone (S23 B). A part inside another,
 * or a repeat, is so left out too.
 */
export function spotlightPath(holes, width, height, { pad = SPOTLIGHT_PAD, radius = SPOTLIGHT_RADIUS } = {}) {
  const kept = (holes ?? [])
    .filter((h) => h && h.width > 0 && h.height > 0)
    .map((h) => ({ left: h.left - pad, top: h.top - pad, width: h.width + 2 * pad, height: h.height + 2 * pad }));
  // Merge until no two cross: a merged part can reach a third
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < kept.length && !merged; i++) {
      for (let j = i + 1; j < kept.length; j++) {
        if (!overlaps(kept[i], kept[j])) continue;
        kept[i] = bounds(kept[i], kept[j]);
        kept.splice(j, 1);
        merged = true;
        break;
      }
    }
  }
  return [`M0 0H${width}V${height}H0Z`, ...kept.map((h) => roundedRect(h, radius))].join("");
}

/**
 * Where to scroll the page so the lit part sits in the middle of the screen
 * (8 Nov 2026, as the tour does): its centre at the screen's centre, or its
 * top a margin below the screen's top when it is taller than the screen.
 * `region` is in viewport px. Returns the new scroll position, kept inside
 * the page, or null when it is already there.
 */
export function centringScroll({ region, viewportHeight, scrollY, maxScroll, margin = 16 }) {
  if (!region || region.height <= 0) return null;
  const top = region.top + scrollY;
  const desired = region.height <= viewportHeight - 2 * margin
    ? top + region.height / 2 - viewportHeight / 2
    : top - margin;
  const next = Math.round(clamp(desired, 0, Math.max(0, maxScroll)));
  return Math.abs(next - scrollY) < 2 ? null : next;
}
