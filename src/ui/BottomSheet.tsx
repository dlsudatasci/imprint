import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { snapPoints, clampSheet, nearestSnap, SNAP_ORDER } from "./sheetSnap";

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
  const drag = useRef<{ id: number; startY: number; startPos: number; dragging: boolean; lastY: number; lastT: number; v: number } | null>(null);

  // Told only when a point moves
  const { collapsed, half, full: fullPoint, panel } = points;
  const onPointsRef = useRef(onPointsChange);
  onPointsRef.current = onPointsChange;
  useEffect(() => {
    onPointsRef.current?.({ collapsed, half, full: fullPoint, panel }, container);
  }, [collapsed, half, fullPoint, panel, container]);

  const position = dragPos ?? rest;
  const toggle = () => onSnapChange(snap === "collapsed" ? "half" : "collapsed");

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { id: e.pointerId, startY: e.clientY, startPos: rest, dragging: false, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.dragging) {
      if (Math.abs(dy) <= DRAG_SLOP_PX) return;
      d.dragging = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Not an active pointer (a synthetic event): the drag still works while over the header
      }
    }
    const dt = e.timeStamp - d.lastT;
    // Upwards is positive: the sheet grows as the finger goes up
    if (dt > 0) d.v = (d.lastY - e.clientY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setDragPos(clampSheet(d.startPos - dy, points));
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.dragging) return;
    const names = snap === "panel" ? ["collapsed", "panel", "full"] : [...SNAP_ORDER];
    const next = nearestSnap(clampSheet(d.startPos - (e.clientY - d.startY), points), d.v, points, snap, names) as SheetSnap;
    setDragPos(null);
    onSnapChange(next);
  };

  const full = points.full;
  const bodyHeight = Math.max(0, rest - headerH - footerH);
  // Compact: the footer is off the screen at rest and rises under the handle
  const footerShift = compact ? Math.min(footerH, Math.max(0, points.collapsed + footerH - position)) : 0;
  const footerAway = compact && snap === "collapsed" && dragPos === null;
  const slide = dragPos === null ? "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out" : "transition-none";

  return (
    <div ref={containerRef} data-no-scroll className="absolute inset-0 pointer-events-none overflow-hidden" style={NO_SCROLL_STYLE}>
      <section
        id={id}
        aria-label="Your answers"
        className={cn(
          "absolute inset-x-0 z-10 pointer-events-auto flex flex-col bg-surface rounded-t-2xl shadow-[0_-8px_24px_rgba(15,23,42,0.18)]",
          slide
        )}
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
        className={cn("absolute inset-x-0 bottom-0 z-20 pointer-events-auto bg-surface border-t border-line px-4 pt-3", compact && slide)}
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
