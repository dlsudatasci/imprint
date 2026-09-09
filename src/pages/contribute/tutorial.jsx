import { useEffect, useState, useCallback } from "react";
import { Joyride } from "react-joyride";
import { useSession } from "next-auth/react";
import { getServerSession } from "next-auth/next";

import Page from "@/ui/page";
import AnnotateForm from "@/features/annotate/form";
import { connectToDatabase } from "@/util/mongodb";
import { clearSession, writeSession, readSessionData, readCurrentCount } from "@/util/sessionCache";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import ContentSkeleton from "@/features/layout/contentSkeleton";
import DesktopOnly from "@/features/annotate/desktopOnly";
import { useCanAnnotate } from "@/hooks/useCanAnnotate";

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

// The four things the tour points at, in order. Kept next to TUTORIAL_STEPS
// below so the "Step n of N" counter can't drift from the actual step list.
const TOUR_STEP_COUNT = 4;

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
 *   touring   the tooltip is open, stepping through the four points in order
 *   beacons   idle; pulsing dots mark each point, and clicking one jumps back
 *             into the tour there
 *
 * The tour library is rebuilt on every mode change, because it keeps internal
 * step state that can't otherwise be reset partway through.
 *
 * Finishing all three images marks the tutorial complete, which is what unlocks
 * annotating in the navbar and on the dashboard.
 */
/* eslint-disable react/forbid-elements -- react-joyride tooltip and beacon controls: the tour library owns these elements' props and behaviour */
export default function TutorialPage({ initialData }) {
  const { status, update } = useSession();
  const loading = status === "loading";
  // The tutorial renders the real annotation form, so it needs the same device
  // check the live flow has. Without it a phone could reach the canvas here and
  // mark the tutorial complete on a tool it can't actually use.
  const canAnnotate = useCanAnnotate();

  const [current, setCurrent] = useState(null);
  const [data, setData] = useState(null);

  // "touring" = auto-open tooltip (disableBeacon: true on all steps)
  // "beacons" = show pulsing dots (disableBeacon: false on all steps)
  const [tourMode, setTourMode] = useState(null);
  const [stepOffset, setStepOffset] = useState(0);
  // Incremented to force-remount Joyride
  const [joyrideKey, setJoyrideKey] = useState(0);
  // Only true once DOM targets (.rp-stage etc) are confirmed in the page
  const [domReady, setDomReady] = useState(false);

  // Joyride positions its tooltips against real DOM nodes, so it can't start
  // until the canvas has actually rendered. The annotation tool mounts async
  // (it waits on the image load before laying out), so there's no lifecycle
  // hook to hang this on — poll for the element instead.
  useEffect(() => {
    if (!current) return;

    setDomReady(false);
    setTourMode(null);

    const interval = setInterval(() => {
      const target = document.querySelector(".rp-stage");
      if (target) {
        clearInterval(interval);
        // Walk them through it once on the first image; after that they've seen
        // the explanations, so sit back in beacon mode and let them ask
        setTourMode(current === 1 ? "touring" : "beacons");
        setStepOffset(0);
        setJoyrideKey((k) => k + 1);
        setDomReady(true);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [current]);

  const CustomTooltip = ({
    index,
    step,
    backProps,
    primaryProps,
    tooltipProps,
  }) => (
    <div
      {...tooltipProps}
      className="bg-surface rounded-card p-5 shadow-2xl w-[320px] max-w-full border border-line font-sans z-[10000]"
    >
      <div className="flex justify-between items-start mb-2">
        {step.title && <h3 className="font-bold text-lg text-ink">{step.title}</h3>}
        {!step.title && <div />}
        <button
          onClick={(e) => {
            e.preventDefault();
            setTourMode("beacons");
            setJoyrideKey((k) => k + 1);
          }}
          aria-label="Dismiss tour"
          className="text-subtle hover:text-body transition-colors duration-300 bg-surface-subtle hover:bg-line-card rounded-full w-6 h-6 flex items-center justify-center -mr-2 -mt-2"
        >
          ×
        </button>
      </div>
      <div className="text-body text-sm leading-relaxed mb-5">
        {step.content}
      </div>
      <div className="flex justify-between items-center mt-4">
        <span className="text-xs font-semibold text-subtle">
          Step {index + stepOffset + 1} of {TOUR_STEP_COUNT}
        </span>
        <div className="flex gap-2">
          {(index > 0 || stepOffset > 0) && (
            <button
              onClick={(e) => {
                if (index === 0) {
                  e.preventDefault();
                  setStepOffset(stepOffset - 1);
                  setJoyrideKey((k) => k + 1);
                } else {
                  backProps.onClick(e);
                }
              }}
              className="px-4 py-2 text-sm font-semibold text-body bg-surface-subtle hover:bg-line rounded-control transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={(e) => {
              if (index + stepOffset === TOUR_STEP_COUNT - 1) {
                e.preventDefault();
                setTourMode("beacons");
                setJoyrideKey((k) => k + 1);
              } else {
                primaryProps.onClick(e);
              }
            }}
            className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-control transition-colors shadow-sm"
          >
            {index + stepOffset === TOUR_STEP_COUNT - 1 ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );

  // Build steps. "touring" = all beacons skipped. overlayClickAction="none" because we use native mousedown to avoid Joyride bugs.
  const buildSteps = useCallback(() => {
    return [
      {
        target: ".rp-stage",
        content: "This is the image annotation area. Click 'Yes' or 'No' on existing dashed boxes, or draw your own by clicking and dragging if you spot an obstruction.",
        skipBeacon: true,
        overlayClickAction: "none",
        placement: "bottom",
      },
      {
        target: "#accessibilityScore",
        content: "Rate the overall accessibility from 1 to 10 using this slider. 1 is very inaccessible, 10 is very safe.",
        skipBeacon: true,
        overlayClickAction: "none",
        placement: "top",
      },
      {
        target: "fieldset",
        content: "Select the surface type that best matches the sidewalk in the image.",
        skipBeacon: true,
        overlayClickAction: "none",
        placement: "top",
      },
      {
        target: "button[type='submit']",
        content: "Click here to proceed to the next image or finish the tutorial.",
        skipBeacon: true,
        overlayClickAction: "none",
        placement: "bottom",
      }
    ];
  }, []);

  // Clicking the dark overlay should dismiss the tour. Joyride's own
  // overlayClickAction advances the step instead of closing in continuous mode,
  // so it's disabled on every step and handled here with a native listener.
  useEffect(() => {
    if (tourMode !== "touring") return;

    const handleOverlayClick = (e) => {
      if (e.target.closest('.react-joyride__overlay')) {
        setTourMode("beacons");
        setJoyrideKey((k) => k + 1);
      }
    };

    document.addEventListener("mousedown", handleOverlayClick);
    return () => document.removeEventListener("mousedown", handleOverlayClick);
  }, [tourMode]);

  // Once the tour runs out of steps (or is skipped) we drop back to the
  // idle state: pulsing beacons the user can click to replay any single step.
  const handleJoyrideCallback = useCallback(({ status: tourStatus }) => {
    if (tourStatus === "finished" || tourStatus === "skipped") {
      setTourMode("beacons");
      setJoyrideKey((k) => k + 1);
    }
  }, []);

  // Main data loading effect
  useEffect(() => {
    if (status !== "authenticated") return;

    // The tutorial deliberately reuses the real annotate form rather than a
    // parallel copy, so the two can't drift apart. The catch is that the form
    // posts to the live endpoints, so we shim fetch for the duration of the
    // page and hand back canned 200s for the three writes.
    //
    // Guarded against double-wrapping: React 18 StrictMode runs effects twice
    // in development, and re-wrapping our own wrapper would leave the original
    // fetch unreachable after cleanup.
    const originalFetch = window.fetch;

    if (!originalFetch.__imprintTutorialShim) {
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
    }

    const isNavigating = sessionStorage.getItem("isNavigatingImages") === "true";
    let currentCount = 1;
    let currentData = { imgRecords: initialData };

    if (!isNavigating) {
      writeSession({ current: 1, total: TUTORIAL_IMAGE_COUNT, data: currentData });
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
        try {
          // Persist first, then refresh the JWT, so the dashboard and navbar
          // both see the completed flag without a hard refresh
          await originalFetch("/api/user/completeTutorial", { method: "POST" });
          await update({ tutorialCompleted: true });
        } catch (error) {
          console.error("Failed to update tutorial completion status:", error);
        }

        clearSession();
        window.location.href = "/contribute";
        return;
      }

      setCurrent(currentCount);
      setData(currentData);
    };

    handleState();

    return () => {
      window.fetch = originalFetch;
    };
  }, [status, initialData, update]);

  // No `typeof window` branch here: rendering different trees on the server and
  // on the client is precisely what breaks hydration. `loading` is true on both
  // for the first render, so gating on it alone is consistent.
  if (loading || canAnnotate === null) return <Page title="Tutorial - Imprint Contribute" contribute><ContentSkeleton /></Page>;
  if (!canAnnotate) return <Page title="Tutorial - Imprint Contribute" contribute><DesktopOnly /></Page>;
  if (!current || !data) return <Page title="Loading Tutorial..." contribute><ContentSkeleton /></Page>;

  const singleImage = data.imgRecords[current - 1];

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

      <AnnotateForm
        data={singleImage}
        current={current}
        total={TUTORIAL_IMAGE_COUNT}
      />

      {/* Custom pulsing beacons on all 4 targets — shown when not in active tour */}
      {domReady && tourMode === "beacons" && (
        <TutorialBeacons onBeaconClick={(idx) => {
          setStepOffset(idx);
          setTourMode("touring");
          setJoyrideKey((k) => k + 1);
        }} />
      )}

      {/* Joyride guided tour — only in touring mode */}
      {domReady && tourMode === "touring" && (
        <Joyride
          key={`joyride-${joyrideKey}`}
          steps={buildSteps().slice(stepOffset)}
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
 * Pulsing dots on all four targets at once, shown when the tour isn't running.
 *
 * Joyride's own beacons appear one at a time, in sequence. Showing all four
 * lets someone jump straight to the part they're unsure about instead of
 * stepping through the whole tour again.
 *
 * Positioned absolutely against the document (rect + scrollY) rather than
 * fixed to the viewport, so they scroll with the page without a scroll handler.
 */
function TutorialBeacons({ onBeaconClick }) {
  const targets = [
    { sel: ".rp-stage", placement: "bottom", offset: 15 },
    { sel: "#accessibilityScore", placement: "bottom", offset: 50 }, // more below
    { sel: "fieldset", placement: "center", offset: 0 },
    { sel: "button[type='submit']", placement: "bottom", offset: 15 } // changed to bottom
  ];
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    const calcPositions = () => {
      // Find right column center using fieldset
      const fieldsetEl = document.querySelector("fieldset");
      let columnCenterX = null;
      if (fieldsetEl) {
        const rect = fieldsetEl.getBoundingClientRect();
        columnCenterX = rect.left + window.scrollX + rect.width / 2;
      }

      const pos = targets.map((t, index) => {
        const el = document.querySelector(t.sel);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        
        let top;
        if (t.placement === "center") {
          top = rect.top + rect.height / 2;
        } else if (t.placement === "bottom") {
          top = rect.bottom + t.offset;
        } else {
          top = rect.top - t.offset;
        }
        
        let left = rect.left + window.scrollX + rect.width / 2;
        // Align all right-column beacons to perfect vertical line
        if (t.sel !== ".rp-stage" && columnCenterX !== null) {
          left = columnCenterX;
        }
        
        return {
          top: top + window.scrollY,
          left,
          index
        };
      }).filter(Boolean);
      setPositions(pos);
    };

    calcPositions();

    // Measure again shortly after. The first pass can land before images have
    // finished loading and pushed the layout down, which would leave the
    // beacons floating over the wrong part of the page.
    const timeout = setTimeout(calcPositions, 300);
    window.addEventListener("resize", calcPositions);
    
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("resize", calcPositions);
    };
  }, []);

  return (
    <>
      {positions.map((pos) => (
        <button
          key={pos.index}
          onClick={() => onBeaconClick(pos.index)}
          className="absolute z-[9999] w-9 h-9 flex items-center justify-center"
          style={{ top: pos.top - 18, left: pos.left - 18 }}
        >
          <span className="absolute w-full h-full rounded-full bg-ink/30 animate-ping" />
          <span className="relative w-4 h-4 rounded-full bg-ink" />
        </button>
      ))}
    </>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session?.user?._id) {
    return { redirect: { destination: "/login", permanent: false } };
  }

  try {
    const { db } = await connectToDatabase();

    // $sample, not $limit — a bare $limit returns the same three documents to
    // every user forever, which makes the walkthrough feel canned and means
    // nobody ever practices on a different kind of street.
    const imgRecords = await db
      .collection("Image")
      .aggregate([
        { $sample: { size: TUTORIAL_IMAGE_COUNT } }
      ])
      .toArray();

    const sanitizedRecords = imgRecords.map(record => {
      const sanitized = { ...record };
      sanitized._id = sanitized._id.toString();
      return sanitized;
    });

    return {
      props: {
        initialData: sanitizedRecords,
      },
    };
  } catch (error) {
    console.error("Error fetching random images for tutorial:", error);
    return {
      props: {
        initialData: [],
      },
    };
  }
}
