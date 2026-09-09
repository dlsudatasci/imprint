
import React from "react";
import { useSession } from "next-auth/react"; // Add this import

import Page from "@/ui/page";
import DesktopOnly from "@/features/annotate/desktopOnly";
import { useCanAnnotate } from "@/hooks/useCanAnnotate";
import AnnotationSessionSelection from "@/features/annotate/selection";
import AnnotateForm from "@/features/annotate/form";
import AnnotationDone from "@/features/annotate/done";
import ContentSkeleton from "@/features/layout/contentSkeleton";
import {
  readTotalCount,
  readCurrentCount,
  readSessionData,
  writeSession,
} from "@/util/sessionCache";

/**
 * The annotation flow — where contributors do the actual work.
 *
 * Which of four screens appears is worked out from the session counters rather
 * than stored as a step number:
 *
 *   no session          → choose a batch size
 *   current <= total    → annotate the current image
 *   current > total     → finished; finalise and celebrate
 *   no mouse or trackpad → desktop-only notice, whatever the above says
 *
 * Session state is read from the local cache first and only fetched from the
 * server when nothing is cached. That is what lets the flow survive a page
 * reload, which matters because the annotation tool reloads the page between
 * every image.
 *
 * The device check runs before the session logic, so nobody on a phone can open
 * a batch they then can't work through. See hooks/useCanAnnotate.
 */
export default function AnnotatePage() {
  const { data: session, status } = useSession(); // Add this line
  const loading = status === "loading";
  // null until the device check runs in the browser; see the skeleton below.
  const canAnnotate = useCanAnnotate();

  const [state, setState] = React.useState({
    annotationTotalCount: null,
    annotationCurrentCount: null,
    annotationSetData: null,
  });

  // True until we know whether a session exists — locally or on the server.
  // Without it, the moment between "nothing cached" and the server answering
  // renders the batch-size picker, so someone resuming a session on a new
  // device is briefly invited to start a second one.
  const [restoring, setRestoring] = React.useState(true);

  React.useEffect(() => {
    if (status === "loading") return;

    const localTotal = readTotalCount();
    const localCurrent = readCurrentCount();
    const localData = readSessionData();

    const hasLocalSession = localTotal !== null && localCurrent !== null && localData;

    if (hasLocalSession) {
      setRestoring(false);

      // Set by the annotation tool just before it reloads the page, so we can
      // tell a deliberate move to the next image from a cold visit
      const isNavigating = sessionStorage.getItem("isNavigatingImages") === "true";
      if (isNavigating) {
        sessionStorage.removeItem("isNavigatingImages");
      }

      setState((prevState) => {
        // Only seed once. The effect reruns as the session settles, and
        // re-seeding would throw away progress made since.
        if (prevState.annotationCurrentCount !== null) return prevState;

        return {
          ...prevState,
          annotationCurrentCount: localCurrent,
          annotationTotalCount: localTotal,
          annotationSetData: localData,
        };
      });
    } else if (status === "authenticated" && session?.user?.username) {
      // Nothing cached — different browser, cleared storage, or a resume from
      // another device. The server holds the real session, so ask it. An empty
      // body means "just tell me what's active", never "start something new".
      fetch("/api/annotationGet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.isExistingSession && data.imgRecords && data.imgRecords.length > 0) {
            const totalCount = data.imgRecords.length;
            const currentCount = data.currentCount || 1;

            // Restore session locally, strictly trusting the server's accurate progress index
            writeSession({ total: totalCount, current: currentCount, data });

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
        .catch((err) => console.error("Failed to restore session:", err))
        .finally(() => setRestoring(false));
    } else {
      // Signed out, or signed in without a username yet. ContributeLayout
      // handles the redirect; there is nothing to restore.
      setRestoring(false);
    }
  }, [status, session]);

  // Hold the page until we know whether a session exists. `restoring` matters
  // as much as `loading`: without it the gap between "nothing cached" and the
  // server answering renders the batch-size picker, so someone resuming on a
  // new device is briefly invited to start a second session.
  //
  // This renders the skeleton rather than null, and has no `typeof window`
  // branch. Both matter: the layout already puts the shell and a skeleton on
  // the server while loading, so returning null here made the client's first
  // render disagree with the server's HTML and hydration failed.
  if (loading || restoring || canAnnotate === null) {
    return (
      <Page title="Annotate - Imprint Contribute" contribute>
        <ContentSkeleton />
      </Page>
    );
  }

  const renderComponent = () => {
    /* If the device can't drive the canvas */
    if (!canAnnotate) {
      return <DesktopOnly />;
    }

    /* If the user has no annotation sessions active */
    if (
      !state.annotationCurrentCount ||
      !state.annotationTotalCount
    ) {
      return (
        <AnnotationSessionSelection />
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

    return <ContentSkeleton />;
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