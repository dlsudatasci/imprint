
import React from "react";
import { isMobile } from "react-device-detect";
import { useSession } from "next-auth/react"; // Add this import

import Page from "@/ui/page";
import { H2 } from "@/ui/Typography";
import MobileWarning from "features/annotate/mobileWarning";
import AnnotationSessionSelection from "features/annotate/selection";
import AnnotateForm from "features/annotate/form";
import AnnotationDone from "features/annotate/done";

// Convert to functional component to use useSession hook
export default function AnnotatePage() {
  const { data: session, status } = useSession(); // Add this line
  const loading = status === "loading";

  const [state, setState] = React.useState({
    annotationTotalCount: null,
    annotationCurrentCount: null,
    annotationSetData: null,
    showResumePrompt: false,
  });

  React.useEffect(() => {
    if (status === "loading") return;

    const localTotal = parseInt(localStorage.getItem("annotationTotalCount"));
    const localCurrent = parseInt(localStorage.getItem("annotationCurrentCount"));
    const localData = JSON.parse(localStorage.getItem("annotationSetData"));

    const hasLocalSession = localTotal && localCurrent && localData;

    if (hasLocalSession) {
      // Handle case where session is already in localStorage (e.g. reload, nav from home, reopen tab)
      const isNavigating = sessionStorage.getItem("isNavigatingImages") === "true";
      if (isNavigating) {
        sessionStorage.removeItem("isNavigatingImages");
      }

      setState((prevState) => {
        // If already set, don't keep resetting it
        if (prevState.annotationCurrentCount !== null) return prevState;

        return {
          ...prevState,
          annotationCurrentCount: localCurrent,
          annotationTotalCount: localTotal,
          annotationSetData: localData,
          showResumePrompt: !isNavigating
        };
      });
    } else if (status === "authenticated" && session?.user?.username) {
      // Try to fetch active session from server if not found locally
      fetch("/api/annotationGet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: session.user.username }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.isExistingSession && data.imgRecords && data.imgRecords.length > 0) {
            const totalCount = data.imgRecords.length;
            const currentCount = data.currentCount || 1;



            // Restore session locally, strictly trusting the server's accurate progress index
            localStorage.setItem("annotationTotalCount", totalCount);
            localStorage.setItem("annotationCurrentCount", currentCount);
            localStorage.setItem("annotationSetData", JSON.stringify(data));



            const isNavigating = sessionStorage.getItem("isNavigatingImages") === "true";
            if (isNavigating) {
              sessionStorage.removeItem("isNavigatingImages");
            }

            setState({
              annotationCurrentCount: currentCount,
              annotationTotalCount: totalCount,
              annotationSetData: data,
              showResumePrompt: !isNavigating,
            });
          }
        })
        .catch((err) => console.error("Failed to restore session:", err));
    }
  }, [status, session]);

  // Handle loading state
  if (typeof window !== "undefined" && loading) return null;

  const renderComponent = () => {
    /* If the user is using a mobile device */
    if (isMobile) {
      return <MobileWarning />;
    }

    /* Show Resume Prompt */
    if (state.showResumePrompt) {
      return (
        <section className="container px-5 mx-auto">
          <section className="pb-12 mt-12">
            <div className="flex flex-col items-center border px-12 py-12 my-5 rounded-md shadow-xl bg-white">
              <H2>Resume Session?</H2>
              <p className="mt-4 text-accent text-center max-w-2xl">
                You have an unfinished annotation session. Would you like to continue from where you left off, or restart with a new session?
              </p>
              <div className="mt-8 flex gap-4">
                {/* Restart Button (Matches Previous Button style) */}
                <button
                  type="button"
                  className="transition-all duration-500 ease-in-out font-semibold py-2 px-6 rounded border hover:-translate-y-0.5 hover:shadow-md text-accent hover:border-accent"
                  onClick={async () => {
                    if (session?.user?.username) {
                      await fetch("/api/annotationAbandon", {
                        method: "POST",
                      });
                    }
                    localStorage.removeItem("annotationTotalCount");
                    localStorage.removeItem("annotationCurrentCount");
                    localStorage.removeItem("annotationSetData");
                    setState({
                      annotationTotalCount: null,
                      annotationCurrentCount: null,
                      annotationSetData: null,
                      showResumePrompt: false,
                    });
                  }}
                >
                  Restart
                </button>

                {/* Continue Button (Matches Submit Button style) */}
                <button
                  type="button"
                  className="transition-all duration-500 ease-in-out font-semibold py-2 px-6 rounded border bg-primary border-primary text-white hover:bg-opacity-90 hover:-translate-y-0.5 hover:shadow-md"
                  onClick={() => setState(prev => ({ ...prev, showResumePrompt: false }))}
                >
                  Continue
                </button>
              </div>
            </div>
          </section>
        </section>
      );
    }

    /* If the user has no annotation sessions active */
    if (
      !state.annotationCurrentCount ||
      !state.annotationTotalCount
    ) {
      return (
        <AnnotationSessionSelection
          username={session?.user?.username}
        />
      );
    }

    /* If the user has an on-going annotation session */
    if (
      state.annotationCurrentCount <= state.annotationTotalCount
    ) {
      const data = state.annotationSetData;
      const singleImage =
        data.imgRecords[state.annotationCurrentCount - 1];

      return (
        <AnnotateForm
          data={singleImage}
          current={state.annotationCurrentCount}
          total={state.annotationTotalCount}
        />
      );
    }

    /* If the user has finished all annotations */
    if (state.annotationCurrentCount > state.annotationTotalCount) {
      return (
        <AnnotationDone
          data={state.annotationSetData}
          total={state.annotationTotalCount}
          username={session?.user?.username}
        />
      );
    }

    return <>Loading</>;
  };

  return (
    <Page
      title="Annotate - Imprint Contribute"
      description="Contribute to Imprint! Let's make our streets accessible for all."
      contribute
    >
      {renderComponent()}
    </Page>
  );
}