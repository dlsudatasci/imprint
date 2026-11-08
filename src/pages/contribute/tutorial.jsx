import { useEffect, useState, useCallback, useRef } from "react";
import { Joyride } from "react-joyride";
import { useSession } from "next-auth/react";
import Router from "next/router";

import Page from "@/ui/page";
import AnnotateForm from "@/features/annotate/form";
import TUTORIAL_IMAGES from "@/data/tutorialImages";
import { clearSession, writeSession, writeTutorialFlag, readSessionData, readCurrentCount, hasCachedSession, readTutorialFlag, readReachedCount, writeReachedCount } from "@/util/sessionCache";
import ContentSkeleton from "@/features/layout/contentSkeleton";
import { useAnnotateLayout } from "@/hooks/useAnnotateLayout";
import { useIsPhone } from "@/hooks/useIsPhone";
import {
  buildTourSteps,
  tourStepCount,
  tourInputFor,
  tourWordsFor,
} from "@/features/tutorial/tourSteps";
import TourCard, { TourStepBody } from "@/features/tutorial/TourCard";
import { fitBesideTarget, whenStill } from "@/features/tutorial/tourFit";
import {
  PRACTICE_STEP_COUNT,
  PRACTICE_STEPS,
  PRACTICE_CONFIRM_MS,
  nextPracticeStep,
  practiceLockFor,
  practiceStepDone,
  practiceStepFor,
  practiceTargets,
} from "@/features/tutorial/practiceSteps";
import { PRACTICE_COPY, practiceLine, practiceNote } from "@/features/tutorial/practiceCopy";
import PracticeGuide from "@/features/tutorial/PracticeGuide";
import { SHEET_EVENT } from "@/ui/annotation-tool/index";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { isAnnotatorUser } from "@/util/userRole";

// Moves the answers sheet on a phone (the annotation tool listens). The detail
// is a snap name, or { snap, scrollTo } with the selector the step points at.
// Any request also closes an open box, so the top of the sheet shows the step.
const moveSheet = (detail) => window.dispatchEvent(new CustomEvent(SHEET_EVENT, { detail }));
// The sheet's slide starting, before the tour waits for its target to keep
// still (whenStill) and measures it
const SHEET_SETTLE_MS = 260;
// How long after the sheet goes back down, from a step that pulled it up, the
// next step also waits for its target to keep still: a step measured before
// the sheet landed had its highlight where the sheet had been (S16b, found on
// a phone 3 Nov 2026)
const SHEET_DOWN_SETTLE_MS = 400;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// How long "Tap ? to see the tour again." stays up
const TOUR_HINT_MS = 4000;
// The first image's boxes as they start, read before the tool changes them:
// doing the practice again puts them back (S19, 8 Nov 2026)
const PRACTICE_IMAGE_JSON = JSON.stringify(TUTORIAL_IMAGES[0]);
// How long "Click the Practice button ... to redo the practice." stays up after Skip practice
const SKIP_HINT_MS = 6000;
// How long the practice's reminder stays up on image 2 (S19). A full sentence
// from 8 Nov 2026, so longer than the 6 seconds the spec gave the short one.
const REMINDER_HINT_MS = 8000;
// Set as the practice reaches its last step, read on image 2 for the reminder (S19)
export const PRACTICE_DONE_KEY = "imprintPracticeDone";
const prefersReducedMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);


// How many images the walkthrough runs through. Referenced by the step counter,
// the progress bar, and the sampling query, so change it in one place.
const TUTORIAL_IMAGE_COUNT = 3;

// Calls the annotate flow makes that must not reach the database during the
// tutorial — nothing here should count toward anyone's real contributions.
const MOCKED_ENDPOINTS = [
  "/api/annotationSubmit",
  "/api/updateSessionCount",
  "/api/annotationAbandon",
];

// The places the tour points at, in order, and the wording of each step
// (annotator and contributor versions) live in src/features/tutorial/tourSteps.js,
// so the "Step n of N" counter can't drift from the step list.
// Contributors have six steps (seven with the touch tour on a phone or tablet,
// S16, 3 Nov 2026), and annotators a tour per step.

/**
 * The guided walkthrough new contributors complete before their first real
 * session.
 *
 * Uses the real annotation form against real images, but intercepts its network
 * calls so the three saving endpoints return success without writing anything.
 * Practice therefore looks and behaves exactly like the real task while leaving
 * the dataset untouched.
 *
 * The tour has two modes:
 *
 *   touring   the tooltip is open, stepping through the points in order
 *   idle      closed; the ? button (the top bar on a phone, the progress
 *             strip on a laptop) runs it again from its first step
 *
 * Pulsing beacons on every point marked the idle tour on a laptop until
 * 3 Nov 2026 (S16b, Rans): now both layouts have the ? button.
 *
 * Contributors practise instead of touring on the first image (S19, 7 Nov
 * 2026, from pilot participant 4): a fresh start of the tutorial runs the
 * practice guide (PracticeGuide, practiceSteps.js), ten steps that each wait
 * for the contributor to do one thing on the photo, while the tool keeps
 * everything else locked (practiceLock). The tool tells the page each change
 * with its state (onPracticeEvent), which decides each step. Skip practice
 * unlocks it all and leaves the ? button. The practice lives in this page's
 * state only, so a reload starts it again from its first step, on the first
 * image's boxes as they were (a reload is a fresh start). After its last
 * step, image 2 opens with no tour and no practice, and a one-time line
 * says where the tips are. Annotators tour as before, and the tour's cards
 * stay for the ? button on every image.
 *
 * The tour library is rebuilt on every mode change, because it keeps internal
 * step state that can't otherwise be reset partway through.
 *
 * Finishing all three images marks the tutorial complete, which is what unlocks
 * annotating in the navbar and on the dashboard.
 */
/* eslint-disable react/forbid-elements -- react-joyride tooltip controls: the tour library owns these elements' props and behaviour */
export default function TutorialPage({ isAnnotator = false }) {
  const { status, update } = useSession();
  const loading = status === "loading";
  // Everyone can do the tutorial on any device (annotators from 12 Oct 2026),
  // so there is no device check. The layout picks the tour.
  const layout = useAnnotateLayout();
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    setCoarsePointer(Boolean(window.matchMedia?.("(pointer: coarse)")?.matches));
  }, []);
  // The sheet layout gets the touch tours, which point at the answers sheet.
  // Phones and tablets always have it, either way up (12 Oct 2026): an iPad
  // held sideways used to get the desktop layout. The desktop layout, for a
  // mouse, keeps the pointer tours.
  const tourInput = tourInputFor(layout);
  const tourWords = tourWordsFor({ layout, coarsePointer });
  // The first step of a tour mentions the full-screen photo on phones and tablets
  const phone = useIsPhone();
  const tablet = coarsePointer && phone === false;

  const [current, setCurrent] = useState(null);
  const [data, setData] = useState(null);
  // The furthest image reached (6 Nov 2026): after going back, the images
  // already done stay done in the progress strip, and can be opened from it
  const [reached, setReached] = useState(null);
  const completingRef = useRef(false);
  // The practice batch is read once per page load (6 Nov 2026). The load
  // effect runs again whenever next-auth hands out a new `update`, as it does
  // when the session is fetched again on the tab coming back into view. By
  // then the moving-between-images flag is used up, so a second run started
  // the tutorial again from a fresh first image, losing every answer.
  const loadedRef = useRef(false);
  // True when this page load started the tutorial afresh, false when it came
  // from another of its images (Next Image, Previous or the strip). The tours
  // run by themselves on a fresh start only, so going back to the first
  // image does not open the tour again (6 Nov 2026).
  const freshStartRef = useRef(false);
  // The practice runs once per page load (S19)
  const practiceStartedRef = useRef(false);

  // "touring" = the tooltip open, "idle" = closed until the ? button
  const [tourMode, setTourMode] = useState(null);
  // Incremented to force-remount Joyride
  const [joyrideKey, setJoyrideKey] = useState(0);
  // Only true once DOM targets (.rp-stage etc) are confirmed in the page
  const [domReady, setDomReady] = useState(false);
  // Annotators move from Objects to Sidewalk to Obstructions on each image (4
  // and 6 Oct 2026), and each step has its own tour (6 Oct 2026).
  // Contributors stay on "objects" throughout.
  const [annotatorStep, setAnnotatorStep] = useState("objects");
  const stepCount = tourStepCount(isAnnotator, annotatorStep, tourInput);
  // Steps whose tour has already run by itself. Like Objects, Sidewalk and
  // Obstructions walk the annotator through on the first image only, once
  // each. On later images the ? button shows them.
  const autoTouredRef = useRef(new Set());
  // The image on screen, read inside the step-change handler below
  const currentRef = useRef(current);
  currentRef.current = current;
  // Once a tour ends nothing on the screen points at it, so the first time it
  // ends the page says how to see it again, under the top bar or the navbar
  // null, "tour" (how to see it again) or "reminder" (after the practice, S19)
  const [tourHint, setTourHint] = useState(null);
  const tourHintShownRef = useRef(false);
  const tourHintTimerRef = useRef(null);
  // When the sheet last went back down after a step that pulled it up
  const sheetDownAtRef = useRef(0);
  // The full-screen photo on a phone (12 Oct 2026). A tour's steps point at the
  // top bar and the answers sheet, which are not on the screen there, so a
  // tour waits: one that would start in full screen starts on leaving it.
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => () => clearTimeout(tourHintTimerRef.current), []);

  // The practice on the first image (S19): the step on screen (0-based), or
  // null when there is none or it was skipped
  const [practiceStep, setPracticeStep] = useState(null);
  // The check mark on the new step's card, for a moment after a step is done
  const [practiceDone, setPracticeDone] = useState(false);
  // The tool's state from its last practice event
  const [practiceState, setPracticeState] = useState(null);
  const practiceStateRef = useRef(null);
  // Counts presses outside the card, which pulse the target once more
  const [practicePulse, setPracticePulse] = useState(0);
  const practiceTimerRef = useRef(null);
  const practiceOn = practiceStep !== null;
  useEffect(() => () => clearTimeout(practiceTimerRef.current), []);

  const onPracticeEvent = useCallback((event) => {
    practiceStateRef.current = event.state;
    setPracticeState(event.state);
  }, []);

  // Skip practice: everything unlocked, and a line saying the button at the
  // top does the practice again (Rans, 8 Nov 2026), unless a message shows there
  const skipPractice = useCallback(() => {
    clearTimeout(practiceTimerRef.current);
    setPracticeDone(false);
    setPracticeStep(null);
    if (messageShownRef.current) return;
    setTourHint("practice");
    clearTimeout(tourHintTimerRef.current);
    tourHintTimerRef.current = setTimeout(() => setTourHint(null), SKIP_HINT_MS);
  }, []);

  // The practice again from its first step, on the first image's boxes as
  // they start (Rans, 8 Nov 2026: the button at the top on the first image,
  // in place of the tour). The form is taken off the page first, as the tool
  // saves its edits to the session copy as it goes; then the first image's
  // copy is put back as it started, the other images' kept, and the form
  // comes back with it.
  const [formKey, setFormKey] = useState(0);
  const [redoing, setRedoing] = useState(false);
  const dataRef = useRef(null);
  const redoPractice = useCallback(() => {
    clearTimeout(tourHintTimerRef.current);
    setTourHint(null);
    setTourMode("idle");
    setRedoing(true);
  }, []);
  useEffect(() => {
    if (!redoing) return;
    const saved = readSessionData() ?? dataRef.current;
    const fresh = { ...saved, imgRecords: saved.imgRecords.map((record, i) => (i === 0 ? JSON.parse(PRACTICE_IMAGE_JSON) : record)) };
    writeSession({ data: fresh });
    setData(fresh);
    practiceStateRef.current = null;
    setPracticeState(null);
    setPracticeDone(false);
    setPracticeStep(0);
    setFormKey((k) => k + 1);
    setRedoing(false);
  }, [redoing]);

  // Each step waits for its action, then the next line comes at once, with a
  // check mark on the card for a moment (none with reduced motion). It waited
  // half a second on the old line until 8 Nov 2026, when Rans found the wait
  // from step 3 to step 5 a drag: the card went back to the closed tree
  // meanwhile. Step 4 is skipped after a No at step 3, and step 7 goes back
  // to step 6 if the drawn box goes.
  useEffect(() => {
    if (practiceStep === null) return;
    const stay = practiceStepFor(practiceStep, practiceState);
    if (stay !== practiceStep) {
      setPracticeStep(stay);
      return;
    }
    if (!practiceStepDone(practiceStep, practiceState)) return;
    setPracticeStep(nextPracticeStep(practiceStep, practiceState));
    if (prefersReducedMotion()) return;
    setPracticeDone(true);
    clearTimeout(practiceTimerRef.current);
    practiceTimerRef.current = setTimeout(() => setPracticeDone(false), PRACTICE_CONFIRM_MS);
  }, [practiceStep, practiceState]);

  // At its last step, the next page load (image 2) shows where the tips are
  useEffect(() => {
    if (practiceStep !== PRACTICE_STEP_COUNT - 1) return;
    try {
      sessionStorage.setItem(PRACTICE_DONE_KEY, "true");
    } catch {
      // No storage: no reminder
    }
  }, [practiceStep]);

  // A press anywhere but the card: nothing happens there, and the target
  // pulses once more. No message.
  useEffect(() => {
    if (!practiceOn) return undefined;
    const onPress = (event) => {
      if (event.target?.closest?.("[data-practice-card]")) return;
      setPracticePulse((n) => n + 1);
    };
    document.addEventListener("pointerdown", onPress, true);
    return () => document.removeEventListener("pointerdown", onPress, true);
  }, [practiceOn]);
  // The laptop's message pill sits where the hint does (S20, 7 Nov 2026). A
  // message matters more: the hint hides at once when one shows, and does not
  // come up while one shows.
  const messageShownRef = useRef(false);
  const onDesktopMessage = useCallback((shown) => {
    messageShownRef.current = shown;
    if (!shown) return;
    clearTimeout(tourHintTimerRef.current);
    setTourHint(null);
  }, []);

  /** A tour ended: finished, dismissed with ×, or a tap on the overlay. */
  const endTour = useCallback(() => {
    setTourMode("idle");
    setJoyrideKey((k) => k + 1);
    if (!tourHintShownRef.current && !messageShownRef.current) {
      tourHintShownRef.current = true;
      setTourHint("tour");
      clearTimeout(tourHintTimerRef.current);
      tourHintTimerRef.current = setTimeout(() => setTourHint(null), TOUR_HINT_MS);
    }
  }, []);

  /** The ? button: the current step's tour from its first step. */
  const showTour = useCallback(() => {
    // A tour step points at the top of the answers sheet, which shows the box
    // panel instead while a box is open: close it and collapse the sheet first
    // (the event is only heard on the sheet layout)
    moveSheet("collapsed");
    setTourHint(null);
    setTourMode("touring");
    setJoyrideKey((k) => k + 1);
  }, []);

  const handleAnnotatorStepChange = useCallback((step) => {
    setAnnotatorStep(step);
    setJoyrideKey((k) => k + 1);
    if (step !== "objects" && currentRef.current === 1 && freshStartRef.current && !autoTouredRef.current.has(step)) {
      autoTouredRef.current.add(step);
      setTourMode("touring");
    } else {
      // A tour left open in the previous step would otherwise carry over
      setTourMode("idle");
    }
  }, []);

  // Joyride positions its tooltips against real DOM nodes, so it can't start
  // until the canvas has actually rendered. The annotation tool mounts async
  // (it waits on the image load before laying out), so there's no lifecycle
  // hook to hang this on — poll for the element instead.
  useEffect(() => {
    if (!current) return;

    setDomReady(false);
    setTourMode(null);
    setAnnotatorStep("objects");

    const interval = setInterval(() => {
      const target = document.querySelector(".rp-stage");
      if (target) {
        clearInterval(interval);
        // Walk them through it once on the first image; after that they've seen
        // the explanations, and the ? button shows them again. Not when they
        // come back to the first image (6 Nov 2026). Contributors practise
        // there instead (S19).
        const firstVisit = current === 1 && freshStartRef.current;
        const practise = firstVisit && !isAnnotator;
        setTourMode(firstVisit && !practise ? "touring" : "idle");
        if (practise && !practiceStartedRef.current) {
          practiceStartedRef.current = true;
          setPracticeStep(0);
        }
        setJoyrideKey((k) => k + 1);
        setDomReady(true);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [current, isAnnotator]);

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

  // A touch tour step whose target is in the part of the answers sheet pulled
  // down carries `sheet: "full"`: the sheet moves up before that step, with
  // its target scrolled into view, and back after it. A step's text becomes
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
        before: () => (Date.now() - sheetDownAtRef.current < SHEET_DOWN_SETTLE_MS ? whenStill(step.target) : Promise.resolve()),
      };
    }),
    [isAnnotator, annotatorStep, tourInput, tourWords, phone, tablet]
  );

  // Clicking the dark overlay should dismiss the tour. Joyride's own
  // overlayClickAction advances the step instead of closing in continuous mode,
  // so it's disabled on every step and handled here with a native listener.
  useEffect(() => {
    if (tourMode !== "touring") return;

    const handleOverlayClick = (e) => {
      if (e.target.closest('.react-joyride__overlay')) endTour();
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

  // The tutorial deliberately reuses the real annotate form rather than a
  // parallel copy, so the two can't drift apart. The catch is that the form
  // posts to the live endpoints, so we shim fetch for the life of the page
  // and hand back canned 200s for the three writes. Its own effect from
  // 6 Nov 2026, so the load below can run once without losing it.
  //
  // Guarded against double-wrapping: React 18 StrictMode runs effects twice
  // in development, and re-wrapping our own wrapper would leave the original
  // fetch unreachable after cleanup.
  useEffect(() => {
    const originalFetch = window.fetch;
    if (originalFetch.__imprintTutorialShim) return undefined;

    const shim = async (...args) => {
      const [input] = args;
      const url = typeof input === "string" ? input : input?.url;

      if (MOCKED_ENDPOINTS.some((endpoint) => url?.startsWith(endpoint))) {
        return new Response(JSON.stringify({ message: "Mock success" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(...args);
    };
    shim.__imprintTutorialShim = true;
    window.fetch = shim;

    return () => {
      if (window.fetch === shim) window.fetch = originalFetch;
    };
  }, []);

  // Main data loading effect
  useEffect(() => {
    if (status !== "authenticated") return;

    // The update() call in the completion path triggers a re-render that
    // re-runs this effect. Without this guard the re-run would re-write
    // the session and tutorial flag after clearSession() already removed them.
    if (completingRef.current) return;

    // Once per page load (see loadedRef)
    if (loadedRef.current) return;

    // A real session is saved on this device (the tutorial is offered only
    // without one, but Back or the address bar still reach it): its copy is
    // not written over with the practice photos, which the annotate page
    // would then have sent as real ones (23 Oct 2026). The dashboard offers
    // Resume Session.
    if (sessionStorage.getItem("isNavigatingImages") !== "true" && hasCachedSession() && !readTutorialFlag()) {
      Router.replace("/contribute");
      return;
    }

    loadedRef.current = true;
    const isNavigating = sessionStorage.getItem("isNavigatingImages") === "true";

    let currentCount = 1;
    let currentData = { imgRecords: TUTORIAL_IMAGES };

    // The practice's reminder (S19): set at its last step, read once here
    let practiceDone = false;
    try {
      practiceDone = sessionStorage.getItem(PRACTICE_DONE_KEY) === "true";
      sessionStorage.removeItem(PRACTICE_DONE_KEY);
    } catch {
      practiceDone = false;
    }

    if (!isNavigating) {
      writeSession({ current: 1, total: TUTORIAL_IMAGE_COUNT, data: currentData });
      writeTutorialFlag(true);
      freshStartRef.current = true;
      practiceDone = false;
    } else {
      sessionStorage.removeItem("isNavigatingImages");
      const savedCount = readCurrentCount();
      const savedData = readSessionData();
      if (savedCount !== null && savedData) {
        currentCount = savedCount;
        currentData = savedData;
      }
    }

    const handleState = async () => {
      if (currentCount > TUTORIAL_IMAGE_COUNT) {
        completingRef.current = true;
        try {
          await window.fetch("/api/user/completeTutorial", { method: "POST" });
          await update({ tutorialCompleted: true });
        } catch (error) {
          console.error("Failed to update tutorial completion status:", error);
        }

        clearSession();
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- kept as a full page load, as it was before the Next.js upgrade brought this rule (S7)
        window.location.href = "/contribute";
        return;
      }

      // The furthest image reached: the first on a fresh start, else at least the one on screen
      const reachedCount = Math.min(
        TUTORIAL_IMAGE_COUNT,
        Math.max(isNavigating ? (readReachedCount() ?? 1) : 1, currentCount)
      );
      writeReachedCount(reachedCount);
      setReached(reachedCount);
      setCurrent(currentCount);
      setData(currentData);
      // Image 2 straight after the practice: where the tips are, once, by the ? button
      if (practiceDone && currentCount === 2 && !messageShownRef.current) {
        tourHintShownRef.current = true;
        setTourHint("reminder");
        clearTimeout(tourHintTimerRef.current);
        tourHintTimerRef.current = setTimeout(() => setTourHint(null), REMINDER_HINT_MS);
      }
    };

    handleState();
  }, [status, update]);

  // No `typeof window` branch here: rendering different trees on the server and
  // on the client is precisely what breaks hydration. `loading` is true on both
  // for the first render, so gating on it alone is consistent.
  if (loading || layout === null) return <Page title="Tutorial - Imprint Contribute" contribute><ContentSkeleton /></Page>;
  if (!current || !data) return <Page title="Loading Tutorial..." contribute><ContentSkeleton /></Page>;

  dataRef.current = data;
  const singleImage = data.imgRecords[current - 1];
  // A contributor's first image: the button at the top does the practice
  // again, in place of the tour (Rans, 8 Nov 2026). The tour stays on the
  // other images, and for annotators.
  const practiceButton = !isAnnotator && current === 1;
  const practice = practiceOn
    ? {
      step: PRACTICE_STEPS[practiceStep],
      lock: practiceLockFor(practiceStep),
      targets: practiceTargets(practiceStep, practiceState, tourWords),
    }
    : null;

  return (
    <Page
      title="Tutorial - Imprint Contribute"
      description="Learn how to annotate images."
      contribute
    >
      <div className="bg-blue-50 border-b border-blue-200 py-3 text-center">
        <span className="text-primary font-semibold text-sm">
          You are in Tutorial Mode. Your submissions will not be saved.
        </span>
      </div>

      {!redoing && <AnnotateForm
        key={formKey}
        data={singleImage}
        current={current}
        reached={reached}
        total={TUTORIAL_IMAGE_COUNT}
        allImages={data.imgRecords}
        isTutorial
        isAnnotator={isAnnotator}
        onAnnotatorStepChange={handleAnnotatorStepChange}
        onDesktopMessage={onDesktopMessage}
        // The ? button that replays the tour: the top bar on a phone, the
        // progress strip on a laptop (S16b, in place of the laptop's beacons).
        // Not during the practice (S19): Skip practice brings it. On a
        // contributor's first image it does the practice again.
        onShowTour={practice ? undefined : practiceButton ? redoPractice : showTour}
        tourButton={practiceButton ? { label: PRACTICE_COPY.redoButton, title: PRACTICE_COPY.redoTitle } : null}
        onFocusChange={setFullScreen}
        onPracticeEvent={practice ? onPracticeEvent : undefined}
        practiceLock={practice ? practice.lock : null}
        practiceHighlight={practice?.targets.highlight ? { ...practice.targets.highlight, pulse: practicePulse } : null}
      />}

      {practice && domReady && !redoing && (
        <PracticeGuide
          step={practiceStep + 1}
          total={PRACTICE_STEP_COUNT}
          // A step with a fallback (Step 2 on touch) says to tap the Step 2
          // line only until the sheet is up, then the laptop's line
          line={practiceLine(practice.step.key, practice.targets.fallback ? "pointer" : tourWords)}
          fallbackLine={practice.targets.fallback ? practiceLine(practice.step.key, tourWords) : undefined}
          note={practiceNote(practice.step.key)}
          done={practiceDone}
          targets={practice.targets}
          onSkip={skipPractice}
          layout={layout}
          reducedMotion={prefersReducedMotion()}
        />
      )}

      {tourHint && !fullScreen && (
        <p
          role="status"
          // The practice's reminder is a sentence (8 Nov 2026): it wraps on a small phone
          className={`pointer-events-none fixed left-1/2 -translate-x-1/2 z-[60] px-3 py-2 bg-ink/85 text-white text-xs font-semibold ${tourHint === "reminder" || tourHint === "practice" ? "w-max max-w-[calc(100vw-32px)] text-center rounded-card" : "whitespace-nowrap rounded-full"}`}
          style={{ top: tourInput === "touch" ? "calc(env(safe-area-inset-top) + 56px)" : "calc(var(--nav-h, 64px) + 12px)" }}
        >
          {/* On a laptop the tour ends scrolled down, with the strip's Tour
              button out of view at the top of the page */}
          {tourHint === "reminder"
            ? (tourWords === "touch" ? PRACTICE_COPY.touchReminder : PRACTICE_COPY.reminder)
            : tourHint === "practice"
              ? (tourWords === "touch" ? PRACTICE_COPY.touchSkipHint : PRACTICE_COPY.skipHint)
              : tourInput === "touch" ? "Tap ? to see the tour again." : "Click Tour at the top of the page to see the tour again."}
        </p>
      )}

      {/* Joyride guided tour — only in touring mode */}
      {domReady && tourMode === "touring" && !fullScreen && (
        <Joyride
          key={`joyride-${joyrideKey}`}
          steps={buildSteps()}
          run={true}
          continuous
          showSkipButton
          styles={{
            options: {
              zIndex: 10000,
            },
            overlay: {
              backgroundColor: "rgba(0, 0, 0, 0.5)",
            }
          }}
          tooltipComponent={CustomTooltip}
          callback={handleJoyrideCallback}
        />
      )}
    </Page>
  );
}

/**
 * Looks up the person's role, so annotators get the annotator wording of the
 * tour. Read from the database rather than the session token, which is only
 * refreshed at sign-in and would miss a role set afterwards with set-role.mjs.
 */
export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  // Falls back to the contributor wording when the lookup fails; the tutorial itself still works
  const isAnnotator = await isAnnotatorUser(session);
  return { props: { session: session ?? null, isAnnotator } };
}
