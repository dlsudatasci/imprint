import { forwardRef, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button, Container, H2, P } from "@/ui";
import { cn } from "@/ui/cn";
import { useMediaQuery, REDUCED_MOTION_QUERY } from "@/hooks/useMediaQuery";
import { useAnnotateLayout, TOUCH_DEVICE_QUERY } from "@/hooks/useAnnotateLayout";
import { ENTRANCE_END, TICKS, demoFrame, tickOf } from "./howItWorks/demoScript";
import { touchFrame, touchTickOf } from "./howItWorks/touchScript";
import { HOW_IT_WORKS_COPY as COPY } from "./howItWorks/howItWorksCopy";
import { useScrollProgress } from "./howItWorks/useScrollProgress";

/**
 * The landing page's preview of the contributor task, right under the
 * figures (added on the redesign of the landing page).
 *
 * Scrolling plays it: the section is a tall track holding a frame that sticks
 * to the screen, and how far the track has scrolled is how far the preview
 * has played (demoScript.js). Scrolling back plays it backwards. It starts
 * while the frame is still sliding into view, which grows from a little
 * smaller to its full size as it arrives, so the eye is drawn in rather than
 * kept waiting. A short scroll after it pins, the camera goes close in, and
 * it plays over 4.1 screens of scrolling (Rans, 15 Oct 2026, after 6 screens
 * with nothing moving until the frame had pinned felt slow, going close in as
 * it arrived felt rushed, and half a screen of stillness after it felt slow).
 *
 * It sits in the page's margins, framed like the map above it, and takes the
 * screen's height: the camera goes close in on the photo while objects are
 * answered and drawn, then back out to the whole page for Step 2 and Next
 * Image. The current chapter is a card over its bottom-left corner, always in
 * the same place (Rans, 15 Oct 2026).
 *
 * With reduced motion asked for, nothing moves with the scroll: the preview
 * is one still per chapter, stepped with Previous step and Next step.
 *
 * The preview itself is drawn by DemoStage, loaded in the browser only so the
 * landing page's first load stays small. The headings and the chapters' text
 * are in the server's HTML, and screen readers get the chapters as a list,
 * since the drawing is hidden from them.
 *
 * Phones and tablets (22 Oct 2026) get the task as the tool shows it there,
 * wherever the tool itself uses its sheet layout (useAnnotateLayout: under
 * 1024 px, and on every touch device): the photo above, the answers in a
 * bottom sheet, a finger instead of a cursor (TouchStage, touchScript.js).
 * The same scroll, the same five chapters and the same answers. The chapter
 * is a band across the top of the frame, where the tool's top bar would be,
 * since a card over the bottom would cover the sheet.
 */

const DemoStage = dynamic(() => import("./howItWorks/DemoStage"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-surface-subtle animate-pulse" />,
});

const TouchStage = dynamic(() => import("./howItWorks/TouchStage"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-surface-subtle animate-pulse" />,
});

/**
 * The still shown for each chapter with reduced motion, the moment that
 * chapter is about: Tree #1's severity at 2, the last No, the drawn box with
 * Lamp Post chosen, Step 2 answered, and the second photo.
 */
export const STILL_TICKS = Object.freeze([
  tickOf("tree-severity", "end"),
  tickOf("lamp-no", "end"),
  tickOf("category-pick", "end"),
  tickOf("overallAccessibility", "end"),
  TICKS,
]);

/**
 * The same on phones and tablets: Tree #1's severity at 1, every suggestion
 * answered, the fitted box with Lamp Post chosen, Step 2 answered, and the
 * second photo.
 */
export const TOUCH_STILL_TICKS = Object.freeze([
  touchTickOf("tree-severity", "end"),
  touchTickOf("moto-no", "end"),
  touchTickOf("category-pick", "end"),
  touchTickOf("overallAccessibility", "end"),
  TICKS,
]);

/**
 * The track is TRACK_SCREENS screens tall, and the preview starts LEAD_IN of
 * a screen before the frame pins, so it plays over TRACK_SCREENS - 1 + LEAD_IN
 * screens. demoScript's ENTRANCE_END is the tick the frame pins at, so the
 * three must agree (HowItWorks.test.jsx checks). Tailwind needs the track's
 * classes written out in full: change them with TRACK_SCREENS.
 */
export const TRACK_SCREENS = 4.6;
export const LEAD_IN = 0.5;
/** How small the frame starts as it slides in */
const ENTRANCE_SCALE = 0.88;

/**
 * The current chapter, a card laid over the preview's bottom-left corner. It
 * stays there for every chapter, so the eye always knows where to find it
 * (Rans, 15 Oct 2026). On a phone it spans the width. DemoStage fades it
 * while the action passes under it. Five bars show where the chapter sits.
 *
 * The chapter is aria-hidden: screen readers get every chapter from the list
 * in the heading.
 */
const Caption = forwardRef(function Caption({ active, children }, ref) {
  const chapter = COPY.chapters[active];
  const total = COPY.chapters.length;
  return (
    <div
      ref={ref}
      data-caption
      className="absolute left-3 right-3 bottom-[18px] sm:left-6 sm:right-auto sm:bottom-[30px] sm:w-[340px] z-30 rounded-card border border-line bg-surface p-4 shadow-2xl transition-opacity duration-300 ease-in-out motion-reduce:transition-none"
    >
      <div aria-hidden="true">
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold text-primary whitespace-nowrap">{COPY.stepOf(active + 1, total)}</p>
          <div className="flex flex-1 gap-1">
            {COPY.chapters.map((c, i) => (
              <span key={c.title} className={cn("h-1 flex-1 rounded-full", i <= active ? "bg-primary" : "bg-line")} />
            ))}
          </div>
        </div>
        <p className="mt-2 font-display text-xl font-bold tracking-tight text-ink">{chapter.title}</p>
        <p className="mt-1 text-sm font-medium text-body">{chapter.text}</p>
      </div>
      {children}
    </div>
  );
});

/**
 * The screen below the navbar (16 Oct 2026). The public pages' navbar became
 * a sticky 64 px bar (`--nav-h`), so the frame sticks under it and is that
 * much shorter, and the preview is never under the bar. svh where the browser
 * has it, so a phone's address bar showing and hiding does not change it.
 * useScrollProgress reads the frame's `top`, so the scroll still starts and
 * ends where the frame starts and stops sticking.
 */
const SCREEN_BELOW_NAV = "h-[calc(100vh-var(--nav-h))] supports-[height:100svh]:h-[calc(100svh-var(--nav-h))]";
const STICKY_FRAME = `sticky top-[var(--nav-h)] ${SCREEN_BELOW_NAV}`;

/**
 * The preview's frame: in the page's margins like the map above it, as tall
 * as the screen less a margin, bordered and rounded like the map.
 */
const FRAME_BOX = "relative h-full overflow-hidden rounded-card border border-line bg-ground";

/** The scroll-played preview */
function ScrollPreview() {
  const trackRef = useRef(null);
  const frameRef = useRef(null);
  const captionRef = useRef(null);
  const progress = useScrollProgress(trackRef, frameRef, { lead: LEAD_IN });
  const frame = demoFrame(progress);
  // 0 to 1 while the frame slides in, then 1: it grows to full size as it pins
  const entrance = Math.min(1, (progress * TICKS) / ENTRANCE_END);

  return (
    // TRACK_SCREENS (4.6) screens tall. svh where the browser has it, so a
    // phone's address bar showing and hiding does not change the track, and
    // vh before that. Tailwind needs the classes written out in full.
    <div ref={trackRef} data-track className="relative h-[460vh] supports-[height:100svh]:h-[460svh]">
      <div ref={frameRef} className={STICKY_FRAME}>
        <Container className="h-full py-4 lg:py-6">
          <div
            data-frame
            className={FRAME_BOX}
            style={entrance < 1 ? { transform: `scale(${ENTRANCE_SCALE + (1 - ENTRANCE_SCALE) * entrance})`, transformOrigin: "50% 0" } : undefined}
          >
            <div className="absolute inset-0" inert aria-hidden="true">
              <DemoStage frame={frame} captionRef={captionRef} />
            </div>
            <Caption ref={captionRef} active={frame.chapter} />
            {/* How far through the preview */}
            <div aria-hidden="true" className="absolute left-0 bottom-0 z-30 h-1 bg-primary" style={{ width: `${progress * 100}%` }} />
          </div>
        </Container>
      </div>
    </div>
  );
}

/** Reduced motion: one still per chapter, stepped by hand, in the same frame */
function StepPreview() {
  const [index, setIndex] = useState(0);
  const captionRef = useRef(null);
  const frame = demoFrame(STILL_TICKS[index] / TICKS);
  const total = COPY.chapters.length;
  return (
    <Container className={cn(SCREEN_BELOW_NAV, "py-4 lg:py-6")}>
      <div className={FRAME_BOX}>
        <div className="absolute inset-0" inert aria-hidden="true">
          <DemoStage frame={frame} captionRef={captionRef} instant />
        </div>
        <Caption ref={captionRef} active={index}>
          <div className="mt-3 flex gap-2">
            <Button variant="neutral" size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              {COPY.previous}
            </Button>
            <Button size="sm" disabled={index === total - 1} onClick={() => setIndex(index + 1)}>
              {COPY.next}
            </Button>
          </div>
        </Caption>
      </div>
    </Container>
  );
}

/**
 * The current chapter on phones and tablets (22 Oct 2026): a band across the
 * top of the frame, where the tool's top bar would be, so it never covers
 * the answers sheet. The same height for every chapter (room for two lines
 * of text), so the screen under it never changes size. The line along its
 * bottom shows how far through the preview is.
 *
 * The chapter is aria-hidden: screen readers get every chapter from the list
 * in the heading.
 */
function TouchCaption({ active, progress = null, children }) {
  const chapter = COPY.touchChapters[active];
  const total = COPY.touchChapters.length;
  return (
    <div data-caption className="relative z-30 shrink-0 border-b border-line bg-surface px-4 py-3">
      <div aria-hidden="true">
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold text-primary whitespace-nowrap">{COPY.stepOf(active + 1, total)}</p>
          <div className="flex flex-1 gap-1">
            {COPY.touchChapters.map((c, i) => (
              <span key={c.title} className={cn("h-1 flex-1 rounded-full", i <= active ? "bg-primary" : "bg-line")} />
            ))}
          </div>
        </div>
        <p className="mt-1.5 font-display text-lg leading-6 font-bold tracking-tight text-ink truncate">{chapter.title}</p>
        <p className="mt-0.5 min-h-[2.5rem] text-sm leading-5 font-medium text-body line-clamp-2">{chapter.text}</p>
      </div>
      {children}
      {progress !== null && (
        // How far through the preview
        <div aria-hidden="true" className="absolute left-0 -bottom-px h-1 bg-primary" style={{ width: `${progress * 100}%` }} />
      )}
    </div>
  );
}

/** The scroll-played preview on phones and tablets: the band, then the tool's phone screen */
function TouchScrollPreview({ coarse }) {
  const trackRef = useRef(null);
  const frameRef = useRef(null);
  const progress = useScrollProgress(trackRef, frameRef, { lead: LEAD_IN });
  const frame = touchFrame(progress);
  const entrance = Math.min(1, (progress * TICKS) / ENTRANCE_END);

  return (
    // The same track as on a laptop (ScrollPreview)
    <div ref={trackRef} data-track className="relative h-[460vh] supports-[height:100svh]:h-[460svh]">
      <div ref={frameRef} className={STICKY_FRAME}>
        <Container className="h-full py-4 lg:py-6">
          <div
            data-frame
            className={cn(FRAME_BOX, "flex flex-col")}
            style={entrance < 1 ? { transform: `scale(${ENTRANCE_SCALE + (1 - ENTRANCE_SCALE) * entrance})`, transformOrigin: "50% 0" } : undefined}
          >
            <TouchCaption active={frame.chapter} progress={progress} />
            <div className="relative min-h-0 flex-1" inert aria-hidden="true">
              <TouchStage frame={frame} coarse={coarse} />
            </div>
          </div>
        </Container>
      </div>
    </div>
  );
}

/** Reduced motion on phones and tablets: one still per chapter, stepped by hand */
function TouchStepPreview({ coarse }) {
  const [index, setIndex] = useState(0);
  const frame = touchFrame(TOUCH_STILL_TICKS[index] / TICKS);
  const total = COPY.touchChapters.length;
  return (
    <Container className={cn(SCREEN_BELOW_NAV, "py-4 lg:py-6")}>
      <div className={cn(FRAME_BOX, "flex flex-col")}>
        <TouchCaption active={index}>
          <div className="mt-3 flex gap-2">
            <Button variant="neutral" size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              {COPY.previous}
            </Button>
            <Button size="sm" disabled={index === total - 1} onClick={() => setIndex(index + 1)}>
              {COPY.next}
            </Button>
          </div>
        </TouchCaption>
        <div className="relative min-h-0 flex-1" inert aria-hidden="true">
          <TouchStage frame={frame} coarse={coarse} instant />
        </div>
      </div>
    </Container>
  );
}

export default function HowItWorks() {
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);
  // "sheet" wherever the tool itself uses its phone and tablet layout, null until the browser has answered
  const layout = useAnnotateLayout();
  const coarse = useMediaQuery(TOUCH_DEVICE_QUERY) === true;
  const touch = layout === "sheet";
  // The server and the first render have no layout, so the laptop text, with the same titles
  const chapters = touch ? COPY.touchChapters : COPY.chapters;
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-title" className="scroll-mt-16 pt-16 lg:pt-24">
      <Container className="text-center pb-8 lg:pb-12">
        <p className="text-sm font-semibold text-primary">{COPY.eyebrow}</p>
        <H2 className="mt-3 text-4xl sm:text-5xl lg:text-6xl tracking-tight">
          <span id="how-it-works-title">{COPY.title}</span>
        </H2>
        <P className="mt-4 mx-auto max-w-2xl text-lg">{COPY.intro}</P>
        <ol className="sr-only">
          {chapters.map((c) => (
            <li key={c.title}>
              {c.title}. {c.text}
            </li>
          ))}
        </ol>
      </Container>
      {/* Until the browser says whether reduced motion is on, and which layout
          the tool would use: one screen of placeholder, so the page without
          JavaScript is not 7 screens of nothing */}
      {reduced === null || layout === null ? (
        <Container>
          <div className="h-[60vh] rounded-card border border-line bg-surface-subtle" />
        </Container>
      ) : touch ? (
        reduced ? <TouchStepPreview coarse={coarse} /> : <TouchScrollPreview coarse={coarse} />
      ) : reduced ? (
        <StepPreview />
      ) : (
        <ScrollPreview />
      )}
    </section>
  );
}
