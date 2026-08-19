import React, { useEffect, useState, useCallback } from "react";
import { Joyride, STATUS, ACTIONS } from "react-joyride";
import Page from "@/ui/page";
import AnnotateForm from "features/annotate/form";
import { useSession } from "next-auth/react";
import { connectToDatabase } from "@/util/mongodb";

export default function TutorialPage({ initialData }) {
  const { data: session, status, update } = useSession();
  const loading = status === "loading";

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

  // Wait for .rp-stage to appear in DOM, then set domReady + initial mode
  useEffect(() => {
    if (!current) return;

    setDomReady(false);
    setTourMode(null);

    // Poll for the target element since the canvas component is heavy
    const interval = setInterval(() => {
      const target = document.querySelector(".rp-stage");
      if (target) {
        clearInterval(interval);
        // First image: auto-open tour. Images 2 & 3: show beacons.
        setTourMode(current === 1 ? "touring" : "beacons");
        setStepOffset(0);
        setJoyrideKey((k) => k + 1);
        setDomReady(true);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [current]);

  const CustomTooltip = ({
    continuous,
    index,
    step,
    backProps,
    closeProps,
    primaryProps,
    tooltipProps,
  }) => (
    <div
      {...tooltipProps}
      className="bg-white rounded-2xl p-5 shadow-2xl w-[320px] max-w-full border border-gray-100 font-sans z-[10000]"
    >
      <div className="flex justify-between items-start mb-2">
        {step.title && <h3 className="font-bold text-lg text-gray-900">{step.title}</h3>}
        {!step.title && <div />}
        <button
          onClick={(e) => {
            e.preventDefault();
            setTourMode("beacons");
            setJoyrideKey((k) => k + 1);
          }}
          className="text-gray-400 hover:text-gray-600 transition-colors bg-gray-50 hover:bg-gray-100 rounded-full w-6 h-6 flex items-center justify-center -mr-2 -mt-2"
        >
          ×
        </button>
      </div>
      <div className="text-gray-600 text-sm leading-relaxed mb-5">
        {step.content}
      </div>
      <div className="flex justify-between items-center mt-4">
        <span className="text-xs font-semibold text-gray-400">
          Step {index + stepOffset + 1} of 4
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
              className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={(e) => {
              if (index + stepOffset === 3) {
                e.preventDefault();
                setTourMode("beacons");
                setJoyrideKey((k) => k + 1);
              } else {
                primaryProps.onClick(e);
              }
            }}
            className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors shadow-sm"
          >
            {index + stepOffset === 3 ? "Finish" : "Next"}
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

  // Native listener for overlay clicks to bypass Joyride's buggy auto-advance in continuous mode
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

  const handleJoyrideCallback = useCallback((cbData) => {
    const { status: tourStatus, action, type, index } = cbData;

    // Tour finished all steps or user skipped → show custom beacons
    if (tourStatus === "finished" || tourStatus === "skipped") {
      setTourMode("beacons");
      setJoyrideKey((k) => k + 1);
      return;
    }
  }, []);

  // Main data loading effect
  useEffect(() => {
    if (status !== "authenticated") return;

    // Intercept fetch to prevent real submissions during tutorial
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [url] = args;
      if (
        url === "/api/annotationSubmit" ||
        url === "/api/updateSessionCount" ||
        url === "/api/annotationAbandon"
      ) {
        return new Response(JSON.stringify({ message: "Mock success" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(...args);
    };

    const isNavigating = sessionStorage.getItem("isNavigatingImages") === "true";
    let currentCount = 1;
    let currentData = { imgRecords: initialData };

    if (!isNavigating) {
      localStorage.setItem("annotationCurrentCount", "1");
      localStorage.setItem("annotationSetData", JSON.stringify(currentData));
    } else {
      sessionStorage.removeItem("isNavigatingImages");
      const savedCount = parseInt(localStorage.getItem("annotationCurrentCount") || "1");
      const savedData = JSON.parse(localStorage.getItem("annotationSetData"));
      if (savedCount && savedData) {
        currentCount = savedCount;
        currentData = savedData;
      }
    }

    const handleState = async () => {
      if (currentCount > 3) {
        try {
          await fetch("/api/user/completeTutorial", { method: "POST" });
          await update({ tutorialCompleted: true });
        } catch (error) {
          console.error("Failed to update tutorial completion status:", error);
        }

        localStorage.removeItem("annotationCurrentCount");
        localStorage.removeItem("annotationTotalCount");
        localStorage.removeItem("annotationSetData");
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
  }, [status, initialData]);

  if (typeof window !== "undefined" && loading) return null;
  if (!current || !data) return <Page title="Loading Tutorial..." contribute><div className="flex justify-center items-center h-screen">Loading...</div></Page>;

  const singleImage = data.imgRecords[current - 1];

  return (
    <Page
      title="Tutorial - Imprint Contribute"
      description="Learn how to annotate images."
      contribute
    >
      <div className="bg-blue-50 border-b border-blue-200 py-3 text-center">
        <span className="text-[#004aad] font-semibold text-sm">
          You are in Tutorial Mode. Your submissions will not be saved.
        </span>
      </div>

      <AnnotateForm
        data={singleImage}
        current={current}
        total={3}
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

// Custom beacons component — renders pulsing dots on all 4 tutorial targets simultaneously
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

    // Calculate once on mount and resize.
    // Absolute positioning + scrollY naturally attaches to the document, so no scroll listener needed!
    calcPositions();
    
    // Add small delay to ensure DOM is fully laid out
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
          <span className="absolute w-full h-full rounded-full bg-black/30 animate-ping" />
          <span className="relative w-4 h-4 rounded-full bg-black shadow-lg" />
        </button>
      ))}
    </>
  );
}

export async function getServerSideProps() {
  try {
    const { db } = await connectToDatabase();

    const imgRecords = await db
      .collection("Image")
      .aggregate([
        { $limit: 3 }
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
