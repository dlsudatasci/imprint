
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