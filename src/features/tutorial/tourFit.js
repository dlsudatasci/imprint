/**
 * Keeping a tour card beside its target (S16b, 3 Nov 2026). On a phone, Add a
 * Box and Your Answers highlight their targets, and a card as tall as its text
 * would cover them on a small screen. fitBesideTarget caps the card at the
 * room on its side of the target, and its text scrolls instead (TourCard reads
 * `--tour-max-h`).
 */
// The card's gap from its target (the arrow and spotlight padding) and from the screen's edge, px
export const CARD_GAP_PX = 28;
export const SCREEN_EDGE_PX = 10;
// Never shorter than this: the title, a few lines and Back and Next
export const CARD_MIN_PX = 180;

/**
 * The most room on one side of a target, px, for a card placed there:
 * between the target and the screen's edge, less the gaps, never under
 * CARD_MIN_PX. `side` is the card's side of the target, "top" or "bottom".
 */
export function roomBeside(target, side, viewportHeight) {
  const room = side === "top"
    ? target.top - CARD_GAP_PX - SCREEN_EDGE_PX
    : viewportHeight - target.bottom - CARD_GAP_PX - SCREEN_EDGE_PX;
  return Math.max(CARD_MIN_PX, Math.floor(room));
}

/**
 * A Floating UI middleware (S16b) for a step whose highlight must stay in
 * view: the card is no taller than the room on its side of the target, so it
 * does not cover it, and its text scrolls instead (TourCard reads
 * `--tour-max-h`). After the library's flip picks the side with the most room.
 */
export const fitBesideTarget = {
  name: "fitBesideTarget",
  fn({ placement, elements }) {
    const side = placement.startsWith("bottom") ? "bottom" : "top";
    const max = `${roomBeside(elements.reference.getBoundingClientRect(), side, window.innerHeight)}px`;
    if (elements.floating.style.getPropertyValue("--tour-max-h") === max) return {};
    elements.floating.style.setProperty("--tour-max-h", max);
    return { reset: { rects: true } };
  },
};

// How many frames in a row a target must keep its place to count as still,
// and the longest a step waits for that
export const STILL_FRAMES = 6;
export const STILL_MAX_MS = 2000;

/**
 * Resolves once the element `selector` finds has kept the same place and
 * height for STILL_FRAMES frames in a row, or after STILL_MAX_MS (S16b,
 * 3 Nov 2026). The tour library measures a step's highlight once, when the
 * step shows, and the answers sheet moves by transform, which it does not
 * see: on a slower phone the sheet was still sliding then, and the highlight
 * stayed where the target had been, over half of Still to decide. A fixed
 * wait guessed at how long the slide takes; this waits for the slide to end.
 * `frame` and `now` are for tests.
 */
export function whenStill(selector, { frame = (f) => requestAnimationFrame(f), now = () => performance.now() } = {}) {
  return new Promise((resolve) => {
    const started = now();
    let last = null;
    let still = 0;
    const check = () => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      const place = r ? `${Math.round(r.top)},${Math.round(r.left)},${Math.round(r.height)}` : "none";
      still = place === last ? still + 1 : 0;
      last = place;
      if (still >= STILL_FRAMES || now() - started > STILL_MAX_MS) resolve();
      else frame(check);
    };
    frame(check);
  });
}
