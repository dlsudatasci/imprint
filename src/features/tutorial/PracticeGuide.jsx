import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/ui";
import { CheckIcon } from "@/ui/icons";
import { PRACTICE_COPY } from "@/features/tutorial/practiceCopy";
import { placeCard, spotlightPath, centringScroll } from "@/features/tutorial/practiceCard";

/**
 * The practice's card, its spotlight and its rings (S19, 7 Nov 2026), over
 * the tutorial's first photo. From Rans's review (8 Nov 2026) it looks and
 * moves as the tour does:
 *
 *   - The screen is dimmed except what the step lights up, and nothing is
 *     dimmed when a step lights nothing (on touch, the steps on the photo)
 *     (`targets.spotlight`: the photo, the panel, a Step 2 question, Next
 *     Image) and the card. Presses on the dimmed part do nothing: only the
 *     lit part and the card take them.
 *   - The lit part is brought to the middle of the screen when the practice
 *     starts and whenever it changes. On a laptop the page itself does not
 *     scroll while the practice runs (Skip practice gives it back), so
 *     nothing slides under the rings. On a phone the screen never scrolls,
 *     and a Step 2 question is brought to the middle of the answers sheet.
 *   - Controls in `targets.rings` get a ring, and every ring and outline
 *     pulses for as long as it shows (motion-safe).
 *
 * The card shows "Practice n of 10", the step's line, Skip practice, and a
 * check mark for a moment after a step (`done`). No Next and no ×. While the
 * fallback targets are in use the card shows `fallbackLine` if there is one
 * (on touch at step 9, "Tap the Step 2 line" until the sheet is up).
 *
 * Everything here is in the page's own coordinates (absolute, in a portal on
 * the body), so it moves with the page exactly. Positions are measured every
 * frame and set on the elements directly, without a render, since the photo
 * zooms and the answers sheet slides without telling anyone.
 */

const RING_GAP = 4;
// The tool's outlines and the open box's mark on the photo
const ON_PHOTO = "[data-practice-highlight]";
const OPEN_BOX = "[data-practice-avoid]";

const toRect = (b) => ({ left: b.left, top: b.top, width: b.width, height: b.height });

/** Whether nothing but the practice's own layer covers the element's top: false inside a part that clips it */
function uncovered(element, rect) {
  if (typeof document.elementsFromPoint !== "function") return true;
  const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
  const y = Math.min(Math.max(rect.top + Math.min(12, rect.height / 2), 0), window.innerHeight - 1);
  const hit = document.elementsFromPoint(x, y).find((e) => !e.closest?.("[data-practice-layer]"));
  return !hit || element.contains(hit);
}

/** What these selectors find, with their rectangles in viewport px. `onScreen` keeps only those on the screen and not clipped. */
function rectsOf(selectors, { onScreen = false } = {}) {
  const result = [];
  for (const selector of selectors ?? []) {
    let elements = [];
    try {
      elements = Array.from(document.querySelectorAll(selector));
    } catch {
      elements = [];
    }
    for (const element of elements) {
      let rect = toRect(element.getBoundingClientRect());
      if (rect.width <= 0 || rect.height <= 0) continue;
      // Inside the answers sheet's list: only the part the list shows
      const scroller = element.closest?.("[data-sheet-scroll]");
      if (scroller) {
        const s = scroller.getBoundingClientRect();
        const top = Math.max(rect.top, s.top);
        const bottom = Math.min(rect.top + rect.height, s.bottom);
        if (bottom <= top) continue;
        rect = { ...rect, top, height: bottom - top };
      }
      if (onScreen) {
        if (rect.top + rect.height <= 0 || rect.top >= window.innerHeight || rect.left + rect.width <= 0 || rect.left >= window.innerWidth) continue;
        if (!uncovered(element, rect)) continue;
      }
      result.push({ element, rect });
    }
  }
  return result;
}

/** The targets in use: the fallback's while its `unless` is not on the page */
export function targetsInUse(targets) {
  const t = targets ?? {};
  const fallback = t.fallback && typeof document !== "undefined" && !document.querySelector(t.fallback.unless);
  return fallback ? { ...t, rings: t.fallback.rings, spotlight: t.fallback.spotlight } : t;
}

const clipToScreen = (r) => {
  const top = Math.max(0, r.top);
  const left = Math.max(0, r.left);
  const bottom = Math.min(window.innerHeight, r.top + r.height);
  const right = Math.min(window.innerWidth, r.left + r.width);
  return bottom > top && right > left ? { left, top, width: right - left, height: bottom - top } : null;
};

/** The lit part to the middle: of the page on a laptop, of the answers sheet's list on a phone */
function bringToMiddle(selectors, layout, reducedMotion) {
  const behavior = reducedMotion ? "auto" : "smooth";
  let elements = [];
  for (const selector of selectors ?? []) {
    try {
      elements = elements.concat(Array.from(document.querySelectorAll(selector)));
    } catch {
      // A selector the page cannot read: nothing to move
    }
  }
  elements = elements.filter((e) => e.getBoundingClientRect().height > 0);
  if (elements.length === 0) return;
  if (layout === "sheet") {
    for (const element of elements) {
      const scroller = element.closest?.("[data-sheet-scroll]");
      if (!scroller) continue;
      const s = scroller.getBoundingClientRect();
      const r = element.getBoundingClientRect();
      const next = centringScroll({
        region: { top: r.top - s.top, height: r.height },
        viewportHeight: s.height,
        scrollY: scroller.scrollTop,
        maxScroll: scroller.scrollHeight - scroller.clientHeight,
      });
      if (next !== null) scroller.scrollTo?.({ top: next, behavior });
    }
    return;
  }
  const rects = elements.map((e) => e.getBoundingClientRect());
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const next = centringScroll({
    region: { top, height: bottom - top },
    viewportHeight: window.innerHeight,
    scrollY: window.scrollY,
    maxScroll: document.documentElement.scrollHeight - window.innerHeight,
  });
  if (next !== null) window.scrollTo({ top: next, behavior });
}

export default function PracticeGuide({ step, total, line, fallbackLine, note = null, done = false, targets, onSkip, layout = "desktop", reducedMotion = false }) {
  const [host, setHost] = useState(null);
  const svgRef = useRef(null);
  const pathRef = useRef(null);
  const cardRef = useRef(null);
  const ringRefs = useRef([]);
  const [ringCount, setRingCount] = useState(0);
  const ringCountRef = useRef(0);
  const [placed, setPlaced] = useState(false);
  const placedRef = useRef(false);
  const [fallbackOn, setFallbackOn] = useState(false);
  const fallbackOnRef = useRef(false);
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  // The layer goes on the body, so it is in the page's coordinates
  useEffect(() => {
    setHost(document.body);
  }, []);

  // A laptop: the page does not scroll while the practice runs, so the lit
  // part stays where it was brought (Rans, 8 Nov 2026). The gutter keeps the
  // page from shifting sideways as its scrollbar goes.
  useEffect(() => {
    if (layout === "sheet") return undefined;
    const html = document.documentElement;
    const body = document.body;
    const before = [html.style.overflow, body.style.overflow, html.style.scrollbarGutter];
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.scrollbarGutter = "stable";
    return () => {
      [html.style.overflow, body.style.overflow, html.style.scrollbarGutter] = before;
    };
  }, [layout]);

  // Measured each frame while the practice runs, and set on the elements directly
  useEffect(() => {
    if (!host) return undefined;
    let frame = 0;
    let litKey = null;
    let centreTimer = 0;
    const measure = () => {
      const use = targetsInUse(targetsRef.current);
      const usingFallback = use !== targetsRef.current;
      if (usingFallback !== fallbackOnRef.current) {
        fallbackOnRef.current = usingFallback;
        setFallbackOn(usingFallback);
      }
      const lit = rectsOf(use.spotlight).map((f) => f.rect);
      const rings = rectsOf(use.rings, { onScreen: true }).map((f) => f.rect);
      const outlines = rectsOf([ON_PHOTO]).map((f) => f.rect);
      const avoid = rectsOf([...(use.avoid ?? []), OPEN_BOX]).map((f) => f.rect);
      const sx = window.scrollX;
      const sy = window.scrollY;

      // The overlay, the page's size, with a cut-out for each lit part
      const width = Math.max(document.documentElement.scrollWidth, window.innerWidth);
      const height = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      if (svgRef.current && pathRef.current) {
        svgRef.current.setAttribute("width", String(width));
        svgRef.current.setAttribute("height", String(height));
        svgRef.current.setAttribute("viewBox", `0 0 ${width} ${height}`);
        // Nothing lit: nothing dimmed, and every press goes through (on touch, the steps on the photo)
        pathRef.current.setAttribute("d", lit.length === 0 ? "" : spotlightPath(lit.map((r) => ({ ...r, left: r.left + sx, top: r.top + sy })), width, height));
      }

      // The rings
      if (rings.length !== ringCountRef.current) {
        ringCountRef.current = rings.length;
        setRingCount(rings.length);
      }
      rings.forEach((r, i) => {
        const el = ringRefs.current[i];
        if (!el) return;
        el.style.left = `${r.left + sx - RING_GAP}px`;
        el.style.top = `${r.top + sy - RING_GAP}px`;
        el.style.width = `${r.width + 2 * RING_GAP}px`;
        el.style.height = `${r.height + 2 * RING_GAP}px`;
      });

      // The card beside what it points at, clear of the lit part where it can be
      const card = cardRef.current;
      if (card) {
        // Kept next to something on request (touch, step 6), clear of the open box too
        const near = use.cardNear ? rectsOf([use.cardNear])[0]?.rect ?? null : null;
        const openBox = near ? rectsOf([OPEN_BOX]).map((f) => f.rect) : [];
        const place = placeCard({
          near,
          targets: [...outlines, ...rings, ...openBox],
          avoid: [...lit.map(clipToScreen).filter(Boolean), ...avoid],
          card: { width: card.offsetWidth, height: card.offsetHeight },
          viewport: { width: window.innerWidth, height: window.innerHeight },
          prefer: layoutRef.current === "sheet" ? "vertical" : "side",
        });
        card.style.left = `${place.left + sx}px`;
        card.style.top = `${place.top + sy}px`;
        if (!placedRef.current) {
          placedRef.current = true;
          setPlaced(true);
        }
      }

      // A new lit part: to the middle, once the layout has settled. Also one
      // wholly out of view, such as a question below what the answers
      // sheet's list shows (found at 320 by 568).
      const key = (use.spotlight ?? []).join("|");
      if (key !== litKey && (use.spotlight ?? []).some((selector) => document.querySelector(selector))) {
        litKey = key;
        clearTimeout(centreTimer);
        centreTimer = setTimeout(() => bringToMiddle(targetsInUse(targetsRef.current).spotlight, layoutRef.current, reducedRef.current), 80);
      }
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(centreTimer);
    };
  }, [host]);

  if (!host) return null;
  return createPortal(
    <div data-practice-layer className="absolute left-0 top-0 z-[70]" style={{ width: 0, height: 0 }}>
      {/* The dimmed screen, as the tour's overlay. Presses there do nothing. */}
      <svg ref={svgRef} aria-hidden="true" className="absolute left-0 top-0 pointer-events-none" width="0" height="0">
        <path ref={pathRef} d="" fill="rgba(0, 0, 0, 0.5)" fillRule="evenodd" style={{ pointerEvents: "auto" }} />
      </svg>
      {Array.from({ length: ringCount }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            ringRefs.current[i] = el;
          }}
          aria-hidden="true"
          data-practice-ring
          className="pointer-events-none absolute rounded-control border-[3px] border-primary motion-safe:animate-practice-pulse"
        />
      ))}
      <div
        ref={cardRef}
        data-practice-card
        // Narrower on a small phone, so it fits beside the open box over the photo
        className="absolute w-[min(264px,calc(100vw-112px))] bg-surface border border-line rounded-card shadow-2xl px-4 pt-3 pb-2 font-sans"
        style={{ visibility: placed ? "visible" : "hidden" }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-subtle">{PRACTICE_COPY.counter(step, total)}</span>
          {done && !reducedMotion && (
            <span data-practice-done className="inline-flex items-center text-primary" role="img" aria-label={PRACTICE_COPY.stepDone}>
              <CheckIcon size={18} />
            </span>
          )}
        </div>
        <p role="status" aria-live="polite" className="mt-1 text-sm font-semibold text-ink leading-snug">
          {fallbackOn && fallbackLine ? fallbackLine : line}
        </p>
        {/* Grey, as the tour's notes are (the lamp post hint, 8 Nov 2026) */}
        {note && <p data-practice-note className="mt-1 text-sm text-muted leading-snug">{note}</p>}
        <div className="mt-1 -ml-4 flex">
          <Button variant="plain" size="sm" onClick={onSkip}>
            {PRACTICE_COPY.skip}
          </Button>
        </div>
      </div>
    </div>,
    host
  );
}
