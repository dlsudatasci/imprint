import { useEffect, useRef, useState } from "react";

/**
 * How far the page has scrolled through a tall track, 0 to 1.
 *
 * The track is taller than the screen and holds a `position: sticky` frame
 * of the screen's height. Without a lead, 0 is the moment the track's top
 * reaches the top of the window, when the frame starts to stick, and 1 the
 * moment its bottom reaches the frame's bottom, when the frame lets go. A
 * `lead` (px) starts the count that much earlier, while the frame is still
 * sliding into view, so the preview is already playing when it arrives
 * (15 Oct 2026).
 *
 * `frameHeight` is the sticky frame's own height, not window.innerHeight: on a
 * phone the frame is 100svh, and innerHeight changes as the browser's address
 * bar shows and hides, which would make the preview jump.
 */
export function progressFromRect(trackTop, trackHeight, frameHeight, lead = 0) {
  const distance = trackHeight - frameHeight;
  if (!(distance > 0) || !Number.isFinite(trackTop)) return 0;
  const early = lead > 0 ? lead : 0;
  const p = (early - trackTop) / (distance + early);
  return p <= 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * Eases the shown value toward the scrolled one, so a mouse wheel's jumps of
 * about 100 px do not make the cursor jump. A fraction of the gap each frame,
 * snapping once the gap is too small to see.
 */
export function stepToward(shown, target, rate = 0.2) {
  const gap = target - shown;
  if (Math.abs(gap) < 0.0005) return target;
  return shown + gap * rate;
}

/**
 * The track's scroll progress, eased, for the preview to render.
 *
 * One requestAnimationFrame loop runs only while the shown value is still
 * moving toward the scrolled one, and stops when it arrives, so an idle page
 * does no work. Scroll and resize only read the track's position and start
 * the loop. Nothing here runs when `enabled` is false (reduced motion).
 * `lead` is a share of the frame's height (see progressFromRect).
 */
export function useScrollProgress(trackRef, frameRef, { enabled = true, lead = 0 } = {}) {
  const [progress, setProgress] = useState(0);
  const shown = useRef(0);
  const target = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const track = trackRef.current;
    const frame = frameRef.current;
    if (!track || !frame) return undefined;

    const tick = () => {
      shown.current = stepToward(shown.current, target.current);
      setProgress(shown.current);
      raf.current = shown.current === target.current ? 0 : requestAnimationFrame(tick);
    };
    const read = () => {
      const rect = track.getBoundingClientRect();
      target.current = progressFromRect(rect.top, rect.height, frame.clientHeight, lead * frame.clientHeight);
      if (!raf.current) raf.current = requestAnimationFrame(tick);
    };

    // Arriving partway down (a reload, a link to an anchor) starts there, without easing in
    const first = track.getBoundingClientRect();
    shown.current = target.current = progressFromRect(first.top, first.height, frame.clientHeight, lead * frame.clientHeight);
    setProgress(shown.current);

    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [trackRef, frameRef, enabled, lead]);

  return progress;
}
