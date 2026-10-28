import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button, Container, H2, P } from "@/ui";
import { cn } from "@/ui/cn";
import { CheckIcon } from "@/ui/icons";
import { useMediaQuery, REDUCED_MOTION_QUERY } from "@/hooks/useMediaQuery";
import { useAnnotateLayout, TOUCH_DEVICE_QUERY } from "@/hooks/useAnnotateLayout";
import { CHAPTERS, ENTRANCE_END, TICKS, demoFrame, tickOf } from "./howItWorks/demoScript";
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
 * It takes the screen's height: the camera goes close in on the photo while
 * objects are answered and drawn, then back out to the whole page for Step 2
 * and Next Image. On a laptop (28 Oct 2026, the advisor's suggestion) the five
 * chapters are steps on a line on its left (StepRail), so something on that
 * side moves along as the page is scrolled: the current step is open with its
 * text, the line under it filling as the scroll goes through it, the others
 * are closed to their titles, and as one step ends it closes while the next
 * one opens. The rail and the preview keep to the page's margins.
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
 * How far the preview is through the chapter it is in, 0 to 1: from the
 * tick the chapter starts at to the tick the next one starts at (the last
 * runs to the end of the scroll). The open step card's bar shows it.
 */
export function chapterShare(tick, chapters = CHAPTERS, end = TICKS) {
  let i = 0;
  chapters.forEach((c, k) => {
    if (tick >= c.start) i = k;
  });
  const start = chapters[i].start;
  const stop = i + 1 < chapters.length ? chapters[i + 1].start : end;
  const share = stop > start ? (tick - start) / (stop - start) : 1;
  return { index: i, share: share <= 0 ? 0 : share > 1 ? 1 : share };
}

/**
 * The rail's motion (28 Oct 2026): the open step's text unfolds as the step
 * before it folds, and the steps' shares of the height move with it, in the
 * same 400 ms on the same curve, so the rail keeps its height and the steps
 * slide rather than jump. The curve is the one the tool's own panels open
 * with (a spring's settle, no overshoot). A CSS transition starts from
 * wherever it is, so scrolling back mid-change turns it round without a
 * jump. With reduced motion it changes at once.
 */
const EASE = "motion-safe:duration-[400ms] motion-safe:ease-[cubic-bezier(0.2,0.8,0.2,1)]";
const UNFOLD = `grid motion-safe:transition-[grid-template-rows,opacity] ${EASE}`;
const SETTLE = `motion-safe:transition-[background-color,color] ${EASE}`;
/**
 * A step's share of the rail's height (Rans, 28 Oct 2026: the steps fill the
 * height beside the preview). Every step but the last takes a share, the open
 * one three. The last has no line below it, so it takes only the height it
 * needs and the line always ends on it at the rail's foot. A step is never
 * shorter than what it holds (flex's min-height: auto), so the text and the
 * reduced-motion buttons always fit.
 */
const STEP = `flex gap-4 motion-safe:transition-[flex-grow] ${EASE}`;

/**
 * The chapters on a laptop (28 Oct 2026, the advisor's suggestion): the five
 * steps on a line to the left of the preview, filling its height, so the left
 * side moves along as the page scrolls. Each step is a numbered dot and its
 * title, with a line down to the next step. The current step is open: a
 * filled dot, its title in ink and its text, and the line under it fills as
 * the scroll goes through the step (`share`, 0 to 1, or null for none). The
 * steps done are ticked and their lines full. The space between the steps is
 * the line itself, not empty boxes (Rans: the tall cards' spacing looked
 * odd). The numbers say where the step sits, so there is no "Step 2 of 5".
 *
 * The rail is aria-hidden: screen readers get every chapter from the list in
 * the heading. Only `children` (Previous step and Next step, with reduced
 * motion) are outside that, under the open step's text.
 */
function StepRail({ active, share = null, children }) {
  const last = COPY.chapters.length - 1;
  return (
    <div data-rail className="flex w-[280px] xl:w-[320px] shrink-0 flex-col">
      {COPY.chapters.map((c, i) => {
        const open = i === active;
        const done = i < active;
        // How much of the line down to the next step is filled
        const fill = done ? 1 : open && share !== null ? share : 0;
        return (
          <div
            key={c.title}
            data-step={done ? "done" : open ? "open" : "next"}
            className={cn(STEP, i === last ? "grow-0 basis-auto" : open ? "basis-0 grow-[3]" : "basis-0 grow")}
          >
            <div aria-hidden="true" className="flex flex-col items-center">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums",
                  SETTLE,
                  open ? "bg-primary text-white" : done ? "bg-primary-100 text-primary" : "bg-line text-muted"
                )}
              >
                {done ? <CheckIcon size={16} /> : i + 1}
              </span>
              {i < last && (
                // The line down to the next step: filled with the scroll through this step, transform only
                <div className="my-2 w-0.5 flex-1 overflow-hidden rounded-full bg-line">
                  <div data-step-bar className="h-full w-full origin-top bg-primary" style={{ transform: `scaleY(${fill})` }} />
                </div>
              )}
            </div>
            <div className={cn("min-w-0 flex-1", i < last && "pb-6")}>
              <p aria-hidden="true" className={cn("font-display text-lg xl:text-xl font-bold leading-8 tracking-tight", SETTLE, open ? "text-ink" : done ? "text-body" : "text-muted")}>
                {c.title}
              </p>
              <div data-unfold className={cn(UNFOLD, open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <div className="min-h-0 overflow-hidden">
                  <p aria-hidden="true" className="pt-1 text-sm leading-6 font-medium text-body">{c.text}</p>
                  {open && children}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
 * The preview's frame: as tall as the screen less a margin, bordered and
 * rounded like the map above it. On a laptop it shares the row with the step
 * rail (DESKTOP_ROW), in the page's own margins like the hero, the map and
 * the figures (Rans, 28 Oct 2026, after trying the wider 1600 px width).
 */
const FRAME_BOX = "relative h-full overflow-hidden rounded-card border border-line bg-ground";
/**
 * The row is at most 760 px tall, centred in the screen (Rans, 28 Oct 2026):
 * in the page's margins the preview is at most 840 px wide, and its close
 * shot of the photo and the answer lists across that width is about 723 px
 * tall (DemoStage's workShot). Taller, it left a band of empty ground under
 * the lists on a big screen.
 */
const DESKTOP_ROW = "flex h-full max-h-[760px] w-full gap-8 xl:gap-10";
/** The row's container, centring the row when the screen is taller than it */
const DESKTOP_SHELL = "flex flex-col justify-center";

/** The scroll-played preview */
function ScrollPreview() {
  const trackRef = useRef(null);
  const frameRef = useRef(null);
  const progress = useScrollProgress(trackRef, frameRef, { lead: LEAD_IN });
  const frame = demoFrame(progress);
  const { share } = chapterShare(progress * TICKS);
  // 0 to 1 while the frame slides in, then 1: it grows to full size as it pins
  const entrance = Math.min(1, (progress * TICKS) / ENTRANCE_END);

  return (
    // TRACK_SCREENS (4.6) screens tall. svh where the browser has it, so a
    // phone's address bar showing and hiding does not change the track, and
    // vh before that. Tailwind needs the classes written out in full.
    <div ref={trackRef} data-track className="relative h-[460vh] supports-[height:100svh]:h-[460svh]">
      <div ref={frameRef} className={STICKY_FRAME}>
        <Container className={cn("h-full py-4 lg:py-6", DESKTOP_SHELL)}>
          {/* The rail and the preview arrive together, growing in as they pin */}
          <div
            data-frame
            className={DESKTOP_ROW}
            style={entrance < 1 ? { transform: `scale(${ENTRANCE_SCALE + (1 - ENTRANCE_SCALE) * entrance})`, transformOrigin: "50% 0" } : undefined}
          >
            <StepRail active={frame.chapter} share={share} />
            <div className={cn(FRAME_BOX, "min-w-0 flex-1")}>
              <div className="absolute inset-0" inert aria-hidden="true">
                <DemoStage frame={frame} />
              </div>
            </div>
          </div>
        </Container>
      </div>
    </div>
  );
}

/** Reduced motion: one still per chapter, stepped by hand, beside the same rail */
function StepPreview() {
  const [index, setIndex] = useState(0);
  const frame = demoFrame(STILL_TICKS[index] / TICKS);
  const total = COPY.chapters.length;
  return (
    <Container className={cn(SCREEN_BELOW_NAV, "py-4 lg:py-6", DESKTOP_SHELL)}>
      <div className={DESKTOP_ROW}>
        <StepRail active={index}>
          <div className="mt-3 flex gap-2">
            <Button variant="neutral" size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              {COPY.previous}
            </Button>
            <Button size="sm" disabled={index === total - 1} onClick={() => setIndex(index + 1)}>
              {COPY.next}
            </Button>
          </div>
        </StepRail>
        <div className={cn(FRAME_BOX, "min-w-0 flex-1")}>
          <div className="absolute inset-0" inert aria-hidden="true">
            <DemoStage frame={frame} instant />
          </div>
        </div>
      </div>
    </Container>
  );
}

/**
 * The current chapter on phones and tablets (22 Oct 2026): a band across the
 * top of the frame, where the tool's top bar would be, so it never covers
 * the answers sheet. The same height for every chapter, so the screen under
 * it never changes size: every chapter's text is laid in the same place and
 * only the current one shows, so the band is as tall as the longest text at
 * this width and no taller (28 Oct 2026). Before, it kept room for three
 * lines everywhere, which left a line of white under the texts that take
 * two. Nothing is cut short. The line along its bottom shows how far through
 * the preview is.
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
        <div data-band-text className="mt-0.5 grid text-sm leading-5 font-medium text-body">
          {COPY.touchChapters.map((c, i) => (
            <p key={c.title} className={cn("[grid-area:1/1]", i !== active && "invisible")}>
              {c.text}
            </p>
          ))}
        </div>
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
