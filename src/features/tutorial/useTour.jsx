import { useCallback, useEffect, useRef, useState } from "react";
import { Joyride } from "react-joyride";

import { buildTourSteps, tourInputFor, tourStepCount, tourWordsFor } from "@/features/tutorial/tourSteps";
import TourCard, { TourStepBody } from "@/features/tutorial/TourCard";
import { fitBesideTarget, whenStill } from "@/features/tutorial/tourFit";
import { SHEET_EVENT } from "@/ui/annotation-tool/index";

/**
 * The tour (react-joyride), shared by the tutorial page and a contributor's
 * real session (S30, 14 Nov 2026). It lived in tutorial.jsx until then. In
 * the tutorial it runs as before. In a session it opens only from the ?
 * button, with the contributor tour as it is.
 *
 * The tour has two modes:
 *
 *   touring   the card is open, stepping through the points in order
 *   idle      closed; the ? button (the top bar on a phone, the progress
 *             strip on a laptop) runs it again from its first step
 *
 * The tour library is rebuilt on every mode change (`remount`), because it
 * keeps internal step state that can't otherwise be reset partway through.
 *
 * `skipMissing` (sessions): a card whose target is not on the screen is left
 * out, and the counter counts only the cards shown. A photo with no sidewalk
 * asks fewer questions, and a target may not be drawn at all. The cards are
 * chosen once the tour has opened and the page has drawn it, so a box the
 * tour closed (on a phone) has given its place back to the list first.
 *
 * `stats()` says how often the tour was opened from the button since the
 * last `resetStats()`, and how long it was open in all, in ms, counting a
 * tour still open. Sessions send it with each photo's telemetry.
 */

// Moves the answers sheet on a phone (the annotation tool listens). The detail
// is a snap name, or { snap, scrollTo } with the selector the step points at.
// Any request also closes an open box, so the top of the sheet shows the step.
// Closing a box keeps its answers: they are saved on the box as they are given.
export const moveSheet = (detail) => window.dispatchEvent(new CustomEvent(SHEET_EVENT, { detail }));
// The sheet's slide starting, before the tour waits for its target to keep
// still (whenStill) and measures it
const SHEET_SETTLE_MS = 260;
// How long after the sheet goes back down, from a step that pulled it up, the
// next step also waits for its target to keep still: a step measured before
// the sheet landed had its highlight where the sheet had been (S16b, found on
// a phone 3 Nov 2026)
const SHEET_DOWN_SETTLE_MS = 400;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Whether a tour step's target is in the part of the answers sheet that
 * scrolls (`data-sheet-scroll`, the part pulled down), not its top. Step 1
 * moves there once it is answered (S15): the top of the sheet is Step 1 until
 * then, and the lists' summary after. Found 14 Nov 2026 (S30): in a session
 * where Step 1 was answered, the first card pointed below the sheet.
 */
export function inSheetBody(selector, doc = document) {
  return Boolean(doc.querySelector(selector)?.closest?.("[data-sheet-scroll]"));
}

/** Whether a tour step's target is on the page and drawn (S30). */
export function targetShown(selector, doc = document) {
  const el = doc.querySelector(selector);
  if (!el) return false;
  // Not drawn: display none on it or above it. Browsers without the check count it as shown.
  return typeof el.checkVisibility === "function" ? el.checkVisibility() : true;
}

/* eslint-disable react/forbid-elements -- react-joyride tooltip controls: the tour library owns these elements' props and behaviour */
export function useTour({
  isAnnotator = false,
  annotatorStep = "objects",
  layout,
  coarsePointer = false,
  phone = false,
  tablet = false,
  // The page's targets are there (the tutorial polls for the photo's stage)
  ready = true,
  // The full-screen photo on a phone: the tour waits until it is left
  fullScreen = false,
  // Told when a tour ends: finished, dismissed with ×, or a tap on the overlay
  onEnd,
  skipMissing = false,
} = {}) {
  // The sheet layout gets the touch tours, which point at the answers sheet.
  // The desktop layout, for a mouse, keeps the pointer tours (tourSteps.js).
  const tourInput = tourInputFor(layout);
  const tourWords = tourWordsFor({ layout, coarsePointer });

  // "touring" = the card open, "idle" = closed until the ? button
  const [tourMode, setTourMode] = useState(null);
  // Incremented to force-remount Joyride
  const [joyrideKey, setJoyrideKey] = useState(0);
  const remount = useCallback(() => setJoyrideKey((k) => k + 1), []);
  // When the sheet last went back down after a step that pulled it up
  const sheetDownAtRef = useRef(0);
  // The target of the step that found its target in the sheet's body and
  // pulled the sheet up for it (S30), for its `after` to put the sheet back.
  // A ref, as the tutorial builds its steps again on every render.
  const pulledUpRef = useRef(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  // How often the tour was opened from the button, and for how long (S30)
  const opensRef = useRef(0);
  const openMsRef = useRef(0);
  const openedAtRef = useRef(null);
  const stats = useCallback(() => ({
    tourOpens: opensRef.current,
    msTourOpen: Math.round(openMsRef.current + (openedAtRef.current !== null ? Date.now() - openedAtRef.current : 0)),
  }), []);
  const tourModeRef = useRef(tourMode);
  tourModeRef.current = tourMode;
  const resetStats = useCallback(() => {
    opensRef.current = 0;
    openMsRef.current = 0;
    openedAtRef.current = tourModeRef.current === "touring" ? Date.now() : null;
  }, []);

  /** A tour ended: finished, dismissed with ×, or a tap on the overlay. */
  const endTour = useCallback(() => {
    if (openedAtRef.current !== null) {
      openMsRef.current += Date.now() - openedAtRef.current;
      openedAtRef.current = null;
    }
    setTourMode("idle");
    setJoyrideKey((k) => k + 1);
    onEndRef.current?.();
  }, []);

  /** The ? button: the tour from its first step. */
  const showTour = useCallback(() => {
    // A tour step points at the top of the answers sheet, which shows the box
    // panel instead while a box is open: close it and collapse the sheet first
    // (the event is only heard on the sheet layout)
    moveSheet("collapsed");
    opensRef.current += 1;
    if (openedAtRef.current === null) openedAtRef.current = Date.now();
    setTourMode("touring");
    setJoyrideKey((k) => k + 1);
  }, []);

  // A touch tour step whose target is in the part of the answers sheet pulled
  // down carries `sheet: "full"`: the sheet moves up before that step, with
  // its target scrolled into view, and back after it. Any other touch step
  // whose target is found there when it comes up does the same (S30): Step 1
  // once answered, which the tutorial's tour never met. A step's text becomes
  // its element here (a contributor step's numbered list, S16), so
  // tourSteps.js stays plain data.
  const buildSteps = useCallback(
    () => buildTourSteps(isAnnotator, annotatorStep, tourInput, { words: tourWords, phone: phone === true, tablet }).map(({ sheet, fitBesideTarget: fit, ...plain }) => {
      const step = {
        ...plain,
        content: <TourStepBody step={plain} />,
        ...(fit ? { floatingOptions: { ...plain.floatingOptions, middleware: [fitBesideTarget] } } : {}),
      };
      if (sheet === "full") {
        return {
          ...step,
          // The highlight is measured once the target has stopped moving: a
          // fixed wait was too short on a slower phone (3 Nov 2026)
          before: () => {
            moveSheet({ snap: "full", scrollTo: step.target });
            return wait(SHEET_SETTLE_MS).then(() => whenStill(step.target));
          },
          after: () => {
            moveSheet("collapsed");
            sheetDownAtRef.current = Date.now();
          },
        };
      }
      // Any other step, just after the sheet went down, waits for its target
      // to keep still, so its highlight is not measured where the sheet had
      // been. The tour library always waits on what `before` returns, so it
      // is always a promise (an undefined one stopped the whole page).
      return {
        ...step,
        before: () => {
          const pullUp = tourInput === "touch" && inSheetBody(step.target);
          pulledUpRef.current = pullUp ? step.target : null;
          if (pullUp) {
            moveSheet({ snap: "full", scrollTo: step.target });
            return wait(SHEET_SETTLE_MS).then(() => whenStill(step.target));
          }
          return Date.now() - sheetDownAtRef.current < SHEET_DOWN_SETTLE_MS ? whenStill(step.target) : Promise.resolve();
        },
        after: () => {
          if (pulledUpRef.current !== step.target) return;
          pulledUpRef.current = null;
          moveSheet("collapsed");
          sheetDownAtRef.current = Date.now();
        },
      };
    }),
    [isAnnotator, annotatorStep, tourInput, tourWords, phone, tablet]
  );

  // Sessions: the cards whose targets are on the screen, chosen after the
  // page has drawn the open tour (see `skipMissing` above). Null until then.
  const [shownSteps, setShownSteps] = useState(null);
  const touring = ready && tourMode === "touring" && !fullScreen;
  useEffect(() => {
    if (!skipMissing) return;
    setShownSteps(touring ? buildSteps().filter((step) => targetShown(step.target)) : null);
  }, [skipMissing, touring, joyrideKey, buildSteps]);
  // Nothing to show: the tour closes rather than pointing at nothing
  useEffect(() => {
    if (skipMissing && touring && shownSteps && shownSteps.length === 0) endTour();
  }, [skipMissing, touring, shownSteps, endTour]);

  const steps = skipMissing ? shownSteps : touring ? buildSteps() : null;
  const stepCount = skipMissing ? (shownSteps?.length ?? 0) : tourStepCount(isAnnotator, annotatorStep, tourInput);

  // Clicking the dark overlay should dismiss the tour. Joyride's own
  // overlayClickAction advances the step instead of closing in continuous mode,
  // so it's disabled on every step and handled here with a native listener.
  useEffect(() => {
    if (tourMode !== "touring") return undefined;

    const handleOverlayClick = (e) => {
      if (e.target.closest(".react-joyride__overlay")) endTour();
    };

    // pointerdown, so a tap on a phone dismisses it too
    document.addEventListener("pointerdown", handleOverlayClick);
    return () => document.removeEventListener("pointerdown", handleOverlayClick);
  }, [tourMode, endTour]);

  // Once the tour runs out of steps (or is skipped) we drop back to the
  // idle state, until the ? button.
  const handleJoyrideCallback = useCallback(({ status: tourStatus }) => {
    if (tourStatus === "finished" || tourStatus === "skipped") endTour();
  }, [endTour]);

  const CustomTooltip = ({
    index,
    step,
    backProps,
    primaryProps,
    tooltipProps,
  }) => (
    <TourCard
      tooltipProps={tooltipProps}
      title={step.title}
      onDismiss={endTour}
      footer={(
        <>
          <span className="text-xs font-semibold text-subtle">
            Step {index + 1} of {stepCount}
          </span>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                onClick={(e) => backProps.onClick(e)}
                className="px-4 py-2 text-sm font-semibold text-body bg-surface-subtle hover:bg-line rounded-control transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={(e) => {
                if (index === stepCount - 1) {
                  e.preventDefault();
                  endTour();
                } else {
                  primaryProps.onClick(e);
                }
              }}
              className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-control transition-colors shadow-sm"
            >
              {index === stepCount - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </>
      )}
    >
      {step.content}
    </TourCard>
  );

  // The tour, only while touring, never in full screen
  const element = touring && steps && steps.length > 0 ? (
    <Joyride
      key={`joyride-${joyrideKey}`}
      steps={steps}
      run={true}
      continuous
      showSkipButton
      styles={{
        options: {
          zIndex: 10000,
        },
        overlay: {
          backgroundColor: "rgba(0, 0, 0, 0.5)",
        },
      }}
      tooltipComponent={CustomTooltip}
      callback={handleJoyrideCallback}
    />
  ) : null;

  return {
    tourMode,
    setTourMode,
    remount,
    showTour,
    endTour,
    tourInput,
    tourWords,
    stepCount,
    stats,
    resetStats,
    element,
  };
}
