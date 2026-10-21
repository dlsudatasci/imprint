import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { snapPoints, clampSheet, nearestSnap, springStep, SNAP_ORDER } from "./sheetSnap";

/**
 * The answers sheet on phones and tablets (contributors, 9 Oct 2026,
 * IMPRINT_contributor_mobile.md section 4.4), like the card in Grab's booking
 * screen: the photo fills the screen above it and stays usable, and the sheet
 * is pulled up to show more.
 *
 * Written here rather than taken from a library: it must not be modal, and it
 * shares the screen with the photo's own touch handling. vaul is built on a
 * modal dialog and react-modal-sheet covers the whole screen.
 *
 * Three parts: a header (the handle and what the caller puts under it, always
 * in view), a body that scrolls, and a footer that is always in view (the
 * action bar). Only the header drags the sheet. It allows sideways scrolling,
 * so rows of chips in it still scroll while a vertical drag moves the sheet.
 * The sheet rests at the points from sheetSnap.js: collapsed, half, full, and
 * panel while a box is open. It is controlled: the caller holds the snap.
 *
 * The sheet slides with a transform and the photo above it never resizes, so
 * the photo's canvas is not rebuilt during a drag. No animation with reduced
 * motion.
 *
 * From 21 Oct 2026 it moves like a sheet on iOS (apple-design): it follows the
 * finger 1:1, a release lands where its speed carries it, and it gets there on
 * a critically damped spring that starts at the finger's speed, instead of a
 * fixed 200 ms slide. It can be grabbed again mid-way and follows the finger
 * from where it is on the screen. It never rests higher than its content needs
 * (sheetSnap.js), and the content shows as it is pulled up.
 *
 * `compact` is the sheet under the full-screen photo (12 Oct 2026): at rest
 * only the handle shows, and the footer comes up with the sheet. The same
 * elements in the same places, so nothing is rebuilt when it changes.
 *
 * Only the body scrolls (`data-sheet-scroll`). The container clips the sheet
 * while it is slid down, and must never scroll itself: a browser asked to
 * bring something into view scrolls a hidden-overflow box too, which shifted
 * the whole screen and left it shifted (found 12 Oct 2026). So it uses
 * `overflow: clip`, which cannot be scrolled, with `hidden` for browsers
 * without it, and is marked `data-no-scroll` for the caller's guard.
 */

export type SheetSnap = "collapsed" | "half" | "full" | "panel";
export type SheetPoints = ReturnType<typeof snapPoints>;

export interface BottomSheetProps {
  id?: string;
  snap: SheetSnap;
  onSnapChange(snap: SheetSnap): void;
  /** Under the handle, always in view */
  header: React.ReactNode;
  /** Scrolls */
  children: React.ReactNode;
  /** Always in view, under the body */
  footer: React.ReactNode;
  /** Told the resting points and the container's height whenever they change */
  onPointsChange?(points: SheetPoints, container: number): void;
  /** Ref to the scrolling body, so the caller can scroll a section into view */
  bodyRef?: React.Ref<HTMLDivElement>;
  /** Collapsed is the handle alone, and the footer comes up with the sheet */
  compact?: boolean;
}

/**
 * `overflow: clip` clips like `hidden` but makes no scroll container, so
 * nothing can scroll the box. A browser that does not know it ignores the
 * inline value and keeps the class's `overflow: hidden`.
 */
export const NO_SCROLL_STYLE: React.CSSProperties = { overflow: "clip" };

// A vertical move on the header past this many px drags the sheet. Below it
// the press stays a tap on whatever it landed on (a chip, Next).
const DRAG_SLOP_PX = 8;
// The release speed is measured over the drag's last 100 ms, and is nothing
// if the finger stood still for 80 ms before lifting
const VELOCITY_WINDOW_MS = 100;
const STILL_MS = 80;
// The spring has arrived within half a pixel and 10 px a second
const SETTLE_PX = 0.5;
const SETTLE_SPEED = 10;

/** Springs only where they can run, and the viewer has not asked for less motion. */
function animates() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function" || typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Drag = { id: number; startY: number; startPos: number; dragging: boolean; samples: Array<{ y: number; t: number }> };

/** Upward speed over the last samples, px per ms; 0 if the finger stood still before lifting. */
function releaseVelocity(samples: Drag["samples"], endT: number) {
  const last = samples[samples.length - 1];
  if (!last || endT - last.t > STILL_MS) return 0;
  const recent = samples.filter((p) => last.t - p.t <= VELOCITY_WINDOW_MS);
  const first = recent[0];
  const dt = last.t - first.t;
  return dt > 0 ? (first.y - last.y) / dt : 0;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Watches an element's height. Zero until measured (and in tests, which have no layout). */
function useHeight(ref: React.RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState(0);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setHeight(el.getBoundingClientRect().height);
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

export default function BottomSheet({ id, snap, onSnapChange, header, children, footer, onPointsChange, bodyRef, compact = false }: BottomSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The home indicator's height, measured: the compact handle rests above it
  const insetRef = useRef<HTMLDivElement>(null);
  const inset = useHeight(insetRef);
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const container = useHeight(containerRef);
  const headerH = useHeight(headerRef);
  const footerH = useHeight(footerRef);
  const contentH = useHeight(contentRef);
  const points = snapPoints({ container, header: headerH, footer: footerH, panel: contentH, compact, inset });
  const rest = points[snap] ?? points.collapsed;

  const [dragPos, setDragPos] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  // The spring's position while it runs, px; null at rest
  const [springPos, setSpringPos] = useState<number | null>(null);
  // Where the sheet is on the screen and how fast it moves (px, px per s,
  // positive upwards): a new spring or a new drag starts from here
  const live = useRef({ pos: rest, vel: 0 });
  const target = useRef(rest);
  const frame = useRef<number | null>(null);

  const stopSpring = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  /** Moves the sheet to `to` from where it is, starting at `velocity` px/s. A running spring just takes the new point. */
  const springTo = (to: number, velocity: number) => {
    target.current = to;
    live.current.vel = velocity;
    const there = Math.abs(live.current.pos - to) < SETTLE_PX && Math.abs(velocity) < SETTLE_SPEED;
    if (!animates() || there) {
      stopSpring();
      live.current = { pos: to, vel: 0 };
      setSpringPos(null);
      return;
    }
    setSpringPos(live.current.pos);
    if (frame.current !== null) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.064, Math.max(0, (now - last) / 1000));
      last = now;
      const displacement = live.current.pos - target.current;
      const next = springStep(displacement, live.current.vel, dt);
      // Arrived, or about to pass its point after a very fast throw: stop on it
      const passed = displacement !== 0 && Math.sign(next.x) !== Math.sign(displacement) && next.x !== 0;
      if (passed || (Math.abs(next.x) < SETTLE_PX && Math.abs(next.v) < SETTLE_SPEED)) {
        frame.current = null;
        live.current = { pos: target.current, vel: 0 };
        setSpringPos(null);
        return;
      }
      live.current = { pos: target.current + next.x, vel: next.v };
      setSpringPos(live.current.pos);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  // A new resting point (another snap, or the content changed size) is sprung
  // to from where the sheet is now. The first measure places it without a slide.
  const lastRest = useRef(rest);
  useIsoLayoutEffect(() => {
    const from = lastRest.current;
    if (from === rest) return;
    lastRest.current = rest;
    if (drag.current?.dragging) return;
    if (from === 0) {
      live.current = { pos: rest, vel: 0 };
      target.current = rest;
      return;
    }
    springTo(rest, live.current.vel);
  }, [rest]);

  useEffect(() => stopSpring, []);

  // Told only when a point moves
  const { collapsed, half, full: fullPoint, panel } = points;
  const onPointsRef = useRef(onPointsChange);
  onPointsRef.current = onPointsChange;
  useEffect(() => {
    onPointsRef.current?.({ collapsed, half, full: fullPoint, panel }, container);
  }, [collapsed, half, fullPoint, panel, container]);

  const position = dragPos ?? springPos ?? rest;
  const toggle = () => onSnapChange(snap === "collapsed" ? "half" : "collapsed");

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { id: e.pointerId, startY: e.clientY, startPos: live.current.pos, dragging: false, samples: [{ y: e.clientY, t: e.timeStamp }] };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.dragging) {
      if (Math.abs(e.clientY - d.startY) <= DRAG_SLOP_PX) return;
      d.dragging = true;
      // Grabbed mid-way: the sheet follows the finger from where it is on the screen
      stopSpring();
      d.startPos = live.current.pos;
      d.startY = e.clientY;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Not an active pointer (a synthetic event): the drag still works while over the header
      }
    }
    d.samples.push({ y: e.clientY, t: e.timeStamp });
    if (d.samples.length > 12) d.samples.shift();
    // Upwards is positive: the sheet grows as the finger goes up
    const pos = clampSheet(d.startPos - (e.clientY - d.startY), points);
    live.current = { pos, vel: releaseVelocity(d.samples, e.timeStamp) * 1000 };
    setSpringPos(null);
    setDragPos(pos);
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.dragging) return;
    const names = snap === "panel" ? ["collapsed", "panel", "full"] : [...SNAP_ORDER];
    const release = clampSheet(d.startPos - (e.clientY - d.startY), points);
    const velocity = releaseVelocity(d.samples, e.timeStamp);
    const next = nearestSnap(release, velocity, points, snap, names) as SheetSnap;
    // The spring takes over at the finger's speed, from where the finger left it
    live.current = { pos: release, vel: velocity * 1000 };
    setDragPos(null);
    springTo(points[next], velocity * 1000);
    onSnapChange(next);
  };

  const full = points.full;
  // Up to where the sheet is shown, so the content is there as it is pulled up
  const bodyHeight = Math.max(0, Math.max(rest, position) - headerH - footerH);
  // Compact: the footer is off the screen at rest and rises under the handle
  const footerShift = compact ? Math.min(footerH, Math.max(0, points.collapsed + footerH - position)) : 0;
  const footerAway = compact && snap === "collapsed" && dragPos === null && springPos === null;

  return (
    <div ref={containerRef} data-no-scroll className="absolute inset-0 pointer-events-none overflow-hidden" style={NO_SCROLL_STYLE}>
      <section
        id={id}
        aria-label="Your answers"
        className="absolute inset-x-0 z-10 pointer-events-auto flex flex-col bg-surface rounded-t-2xl shadow-[0_-8px_24px_rgba(15,23,42,0.18)] will-change-transform"
        style={{
          bottom: footerH,
          height: Math.max(0, full - footerH),
          transform: `translateY(${Math.max(0, full - position)}px)`,
        }}
      >
        <div
          ref={headerRef}
          className="shrink-0 select-none"
          style={{ touchAction: "pan-x" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <button
            type="button"
            aria-expanded={snap !== "collapsed"}
            aria-label={snap === "collapsed" ? "Show more" : "Show less"}
            onClick={toggle}
            className="w-full h-11 grid place-items-center rounded-t-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
          >
            <span aria-hidden="true" className="block w-9 h-[5px] rounded-full bg-line" />
          </button>
          {header}
        </div>
        <div
          ref={bodyRef}
          data-sheet-scroll
          className="min-h-0 overflow-y-auto overscroll-contain border-t border-line"
          style={{ height: bodyHeight }}
        >
          <div ref={contentRef}>{children}</div>
        </div>
      </section>
      <div
        ref={footerRef}
        inert={footerAway}
        className="absolute inset-x-0 bottom-0 z-20 pointer-events-auto bg-surface border-t border-line px-4 pt-3"
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
          transform: footerShift > 0 ? `translateY(${footerShift}px)` : undefined,
        }}
      >
        {footer}
      </div>
      <div ref={insetRef} aria-hidden="true" className="absolute bottom-0 left-0 w-0" style={{ height: "env(safe-area-inset-bottom)" }} />
    </div>
  );
}
