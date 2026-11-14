import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import Router from "next/router";

import Page from "@/ui/page";
import AnnotateForm from "@/features/annotate/form";
import TUTORIAL_IMAGES from "@/data/tutorialImages";
import { clearSession, writeSession, writeTutorialFlag, readSessionData, readCurrentCount, hasCachedSession, readTutorialFlag, readReachedCount, writeReachedCount } from "@/util/sessionCache";
import ContentSkeleton from "@/features/layout/contentSkeleton";
import { useAnnotateLayout } from "@/hooks/useAnnotateLayout";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useTour } from "@/features/tutorial/useTour";
import TourHint from "@/features/tutorial/TourHint";
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
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { isAnnotatorUser } from "@/util/userRole";
import { tutorialImageCount, FINISH_TUTORIAL_LABEL } from "@/util/tutorialVersion";

// How long "Tap ? to see the tour again." stays up
const TOUR_HINT_MS = 4000;
// The first image's boxes as they start, read before the tool changes them:
// doing the practice again puts them back (S19, 8 Nov 2026)
const PRACTICE_IMAGE_JSON = JSON.stringify(TUTORIAL_IMAGES[0]);
// How long "Click the Practice button ... to redo the practice." stays up after Skip practice
const SKIP_HINT_MS = 6000;
const prefersReducedMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

// How many images the walkthrough runs through (util/tutorialVersion.js):
// one for contributors from S30 (14 Nov 2026), three for annotators. Used by
// the counter, the progress strip, the saved copy and the completion check.

// Calls the annotate flow makes that must not reach the database during the
// tutorial — nothing here should count toward anyone's real contributions.
const MOCKED_ENDPOINTS = [
  "/api/annotationSubmit",
  "/api/updateSessionCount",
  "/api/annotationAbandon",
];

// The places the tour points at, in order, and the wording of each step
// (annotator and contributor versions) live in src/features/tutorial/tourSteps.js,
// so the "Step n of N" counter can't drift from the step list. The tour
// itself is useTour (S30), shared with a contributor's real sessions.
// Annotators have a tour per step.

/**
 * The guided walkthrough new contributors complete before their first real
 * session.
 *
 * Uses the real annotation form against real images, but intercepts its network
 * calls so the three saving endpoints return success without writing anything.
 * Practice therefore looks and behaves exactly like the real task while leaving
 * the dataset untouched.
 *
 * The tour (useTour, S30) has two modes:
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
 * practice guide (PracticeGuide, practiceSteps.js), eleven steps from S15 (Step 1 first) that each wait
 * for the contributor to do one thing on the photo, while the tool keeps
 * everything else locked (practiceLock). The tool tells the page each change
 * with its state (onPracticeEvent), which decides each step. Skip practice
 * unlocks it all and leaves the Practice button. The practice lives in this page's
 * state only, so a reload starts it again from its first step, on the first
 * image's boxes as they were (a reload is a fresh start). Annotators tour as
 * before, and the tour's cards stay for the ? button on every image.
 *
 * From S30 (14 Nov 2026, participants found the tutorial long and technical)
 * a contributor's tutorial is that first photo alone: its last step says to
 * press Finish Tutorial, and finishing it completes the tutorial. After Skip
 * practice the photo is still answered in full before Finish Tutorial is
 * accepted, as on any photo. Until then photos 2 and 3 followed, with the tour
 * from the ? button and a one-time line on photo 2 saying where it was. The
 * tour is now on every photo of a contributor's real session instead
 * (annotate.jsx), and the line shows once on the first one.
 *
 * Finishing the last image (the first for contributors, the third for
 * annotators) marks the tutorial complete, which is what unlocks annotating
 * in the navbar and on the dashboard.
 */
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
  // The sheet layout gets the touch tours, which point at the answers sheet
  // (useTour). Phones and tablets always have it, either way up (12 Oct
  // 2026). The desktop layout, for a mouse, keeps the pointer tours.
  // The first step of a tour mentions the full-screen photo on phones and tablets
  const phone = useIsPhone();
  const tablet = coarsePointer && phone === false;
  const imageCount = tutorialImageCount(isAnnotator);

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

  // Only true once DOM targets (.rp-stage etc) are confirmed in the page
  const [domReady, setDomReady] = useState(false);
  // Annotators move from Objects to Sidewalk to Obstructions on each image (4
  // and 6 Oct 2026), and each step has its own tour (6 Oct 2026).
  // Contributors stay on "objects" throughout.
  const [annotatorStep, setAnnotatorStep] = useState("objects");
  // Steps whose tour has already run by itself. Like Objects, Sidewalk and
  // Obstructions walk the annotator through on the first image only, once
  // each. On later images the ? button shows them.
  const autoTouredRef = useRef(new Set());
  // The image on screen, read inside the step-change handler below
  const currentRef = useRef(current);
  currentRef.current = current;
  // Once a tour ends nothing on the screen points at it, so the first time it
  // ends the page says how to see it again, under the top bar or the navbar
  // null, "tour" (how to see it again) or "practice" (after Skip practice).
  // The practice's reminder on image 2 went with image 2 (S30).
  const [tourHint, setTourHint] = useState(null);
  const tourHintShownRef = useRef(false);
  const tourHintTimerRef = useRef(null);
  // The full-screen photo on a phone (12 Oct 2026). A tour's steps point at the
  // top bar and the answers sheet, which are not on the screen there, so a
  // tour waits: one that would start in full screen starts on leaving it.
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => () => clearTimeout(tourHintTimerRef.current), []);
  // The laptop's message pill sits where the hint does (S20, 7 Nov 2026). A
  // message matters more: the hint hides at once when one shows, and does not
  // come up while one shows.
  const messageShownRef = useRef(false);

  // The first time a tour ends, how to see it again
  const onTourEnd = useCallback(() => {
    if (!tourHintShownRef.current && !messageShownRef.current) {
      tourHintShownRef.current = true;
      setTourHint("tour");
      clearTimeout(tourHintTimerRef.current);
      tourHintTimerRef.current = setTimeout(() => setTourHint(null), TOUR_HINT_MS);
    }
  }, []);
  const tour = useTour({ isAnnotator, annotatorStep, layout, coarsePointer, phone, tablet, ready: domReady, fullScreen, onEnd: onTourEnd });
  const { tourInput, tourWords, setTourMode, remount, showTour: openTour } = tour;

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
  }, [setTourMode]);
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
  const onDesktopMessage = useCallback((shown) => {
    messageShownRef.current = shown;
    if (!shown) return;
    clearTimeout(tourHintTimerRef.current);
    setTourHint(null);
  }, []);

  /** The ? button: the current step's tour from its first step. */
  const showTour = useCallback(() => {
    setTourHint(null);
    openTour();
  }, [openTour]);

  const handleAnnotatorStepChange = useCallback((step) => {
    setAnnotatorStep(step);
    remount();
    if (step !== "objects" && currentRef.current === 1 && freshStartRef.current && !autoTouredRef.current.has(step)) {
      autoTouredRef.current.add(step);
      setTourMode("touring");
    } else {
      // A tour left open in the previous step would otherwise carry over
      setTourMode("idle");
    }
  }, [remount, setTourMode]);

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
        remount();
        setDomReady(true);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [current, isAnnotator, remount, setTourMode]);

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
    // Annotators' three photos, or a contributor's first (S30). TUTORIAL_IMAGES
    // keeps all three for annotators and the landing page's previews.
    let currentData = { imgRecords: TUTORIAL_IMAGES.slice(0, imageCount) };

    if (!isNavigating) {
      writeSession({ current: 1, total: imageCount, data: currentData });
      writeTutorialFlag(true);
      freshStartRef.current = true;
    } else {
      sessionStorage.removeItem("isNavigatingImages");
      const savedCount = readCurrentCount();
      const savedData = readSessionData();
      if (savedCount !== null && savedData) {
        currentCount = savedCount;
        currentData = savedData;
        // A copy saved by the three-photo tutorial before S30 (someone mid-
        // tutorial at the deploy): a contributor still on a photo it has is
        // given the first alone, in the strip and in the saved copy, which the
        // Practice button reads again. Past the last photo it completes below.
        // Annotators' copies have their three photos, so nothing changes.
        if (savedCount <= imageCount && Array.isArray(savedData.imgRecords) && savedData.imgRecords.length > imageCount) {
          currentData = { ...savedData, imgRecords: savedData.imgRecords.slice(0, imageCount) };
          writeSession({ total: imageCount, current: savedCount, data: currentData });
        }
      }
    }

    const handleState = async () => {
      if (currentCount > imageCount) {
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
        imageCount,
        Math.max(isNavigating ? (readReachedCount() ?? 1) : 1, currentCount)
      );
      writeReachedCount(reachedCount);
      setReached(reachedCount);
      setCurrent(currentCount);
      setData(currentData);
    };

    handleState();
  }, [status, update, imageCount]);

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
        total={imageCount}
        allImages={data.imgRecords}
        isTutorial
        // The last photo's button (S30), the first for contributors, the third for annotators
        finishLabel={FINISH_TUTORIAL_LABEL}
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
          line={practiceLine(practice.step.key, practice.targets.fallback ? "pointer" : tourWords, practice.targets.line)}
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
        // The Skip practice hint is a sentence (8 Nov 2026): it wraps on a small phone
        <TourHint input={tourInput} wide={tourHint === "practice"}>
          {/* On a laptop the tour ends scrolled down, with the strip's Tour
              button out of view at the top of the page */}
          {tourHint === "practice"
            ? (tourWords === "touch" ? PRACTICE_COPY.touchSkipHint : PRACTICE_COPY.skipHint)
            : tourInput === "touch" ? "Tap ? to see the tour again." : "Click Tour at the top of the page to see the tour again."}
        </TourHint>
      )}

      {/* Joyride guided tour — only in touring mode */}
      {tour.element}
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
