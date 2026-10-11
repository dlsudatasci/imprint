import { ConfirmDialog, Container, containerClass } from "@/ui";
import { useEffect, useState } from "react";
import { ReactPictureAnnotation } from "@/ui/annotation-tool/index";
import { useSession } from "next-auth/react";
import { clearSession } from "@/util/sessionCache";
import ProgressStrip from "@/features/annotate/ProgressStrip";
import MobileTopBar from "@/features/annotate/MobileTopBar";
import ContentSkeleton from "@/features/layout/contentSkeleton";
import { useAnnotateLayout } from "@/hooks/useAnnotateLayout";
import { requiresSidewalkMask } from "@/util/validators/sidewalkMask";

// A phone held sideways. Tablets are taller than 500 px and are not affected.
const SIDEWAYS_QUERY = "(orientation: landscape) and (max-height: 500px)";

/** A media query's live answer, false until it runs in the browser. */
function useMediaQuery(query) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return undefined;
    setMatch(list.matches);
    if (!list.addEventListener) return undefined;
    const onChange = (event) => setMatch(event.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return match;
}

/**
 * The annotation screen: the progress, Pause and Stop, and the tool.
 *
 * Two layouts (9 Oct 2026, IMPRINT_contributor_mobile.md section 4). From
 * 1024 CSS px wide, and always for annotators, the page as it was: the
 * progress strip, the title and the tool. Under 1024 px contributors get one
 * full-screen surface over the site's navbar and footer: a slim top bar, the
 * photo filling the screen and the answers in a bottom sheet. The page under
 * it does not scroll while it is open. A phone held sideways shows a notice
 * over the tool, which stays mounted under it, so nothing is lost.
 */
export default function AnnotateForm({
  data,
  current,
  total,
  allImages,
  isTutorial = false,
  isAnnotator = false,
  onAnnotatorStepChange,
}) {
  const onSelect = () => { };
  const onChange = () => { };
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const [showAbandonModal, setShowAbandonModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  // null until it runs in the browser. Annotators always get the desktop layout.
  const widthLayout = useAnnotateLayout();
  const layout = isAnnotator ? "desktop" : widthLayout;
  const sheet = layout === "sheet";
  const sideways = useMediaQuery(SIDEWAYS_QUERY);

  // The full-screen surface: the page under it must not scroll
  useEffect(() => {
    if (!sheet) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const before = [html.style.overflow, body.style.overflow];
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = before[0];
      body.style.overflow = before[1];
    };
  }, [sheet]);

  if (loading) return null;
  if (layout === null) return <ContentSkeleton />;

  const dialogs = (
    <>
      <ConfirmDialog
        open={showPauseModal}
        title="Pause Session?"
        description="Your submitted images are saved, and so is your work on this image on this device. Resume from the dashboard to pick up where you left off."
        confirmLabel="Pause & Exit"
        onCancel={() => setShowPauseModal(false)}
        onConfirm={async () => {
          try {
            await fetch("/api/updateSessionCount", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ currentAnnotationCount: current }),
            });
            // The session cache is kept (8 Oct 2026): it holds the current
            // image's unsubmitted boxes and answers, which Resume restores on
            // this device. The tool saves a waiting edit as the page is left.
            window.location.href = "/contribute";
          } catch (e) {
            console.error(e);
          }
        }}
      />

      <ConfirmDialog
        open={showAbandonModal}
        title={isTutorial ? "Stop Tutorial?" : "Stop Session?"}
        description={isTutorial
          ? "Are you sure you want to stop the tutorial? You can replay it anytime from the dashboard."
          : "Are you sure you want to stop this session? Images you have already submitted will be saved, but progress on the current image will be lost."
        }
        confirmLabel={isTutorial ? "Yes, Stop Tutorial" : "Yes, Stop Session"}
        destructive
        onCancel={() => setShowAbandonModal(false)}
        onConfirm={async () => {
          try {
            if (!isTutorial) {
              await fetch("/api/annotationAbandon", { method: "POST" });
            }
            clearSession();
            window.location.href = "/contribute";
          } catch (e) {
            console.error(e);
          }
        }}
      />
    </>
  );

  const tool = (
    <ReactPictureAnnotation
      image={data.url}
      onSelect={onSelect}
      onChange={onChange}
      width={640 * 1.5}
      height={400 * 1.5}
      annotationData={data.annotationList}
      imageID={data.imageID}
      city={data.city}
      servedModelVersion={data.modelVersion}
      isReference={data.isReference ?? false}
      currentAnnotationCount={current}
      totalAnnotationCount={total}
      username={session?.user?.username ?? ""}
      isAnnotator={isAnnotator}
      // Model-development images get the Sidewalk step. The tutorial always
      // shows it to annotators, so they practise it (6 Oct 2026).
      askSidewalk={isAnnotator && (isTutorial || requiresSidewalkMask(data))}
      onAnnotatorStepChange={onAnnotatorStepChange}
      layout={layout}
    />
  );

  // One tree for both layouts, with the tool at the same place in it, so
  // turning a tablet between them keeps the tool, its selection and its
  // timers. A different wrapper per layout would rebuild the tool.
  return (
    <div className={sheet ? "annotate-sheet-screen fixed inset-0 z-40 flex flex-col" : undefined}>
      {dialogs}
      {sheet ? (
        <MobileTopBar
          current={current}
          total={total}
          onPause={() => setShowPauseModal(true)}
          onStop={() => setShowAbandonModal(true)}
          isTutorial={isTutorial}
        />
      ) : (
        <Container width="wide" className="pt-3">
          {/* Netflix-style progress strip */}
          <ProgressStrip
            images={allImages || []}
            current={current}
            total={total}
            onPause={() => setShowPauseModal(true)}
            onStop={() => setShowAbandonModal(true)}
            isTutorial={isTutorial}
          />

          {/* Title */}
          <h1 className="font-display text-4xl lg:text-5xl font-extrabold text-ink text-center tracking-tight mb-8">
            Sidewalk #{current}
          </h1>
        </Container>
      )}
      <div className={sheet ? "relative flex-1 min-h-0 flex flex-col" : containerClass("wide", "pb-3")}>
        {tool}
      </div>
      {sheet && sideways && (
        <div role="status" className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 px-8 bg-ink text-white text-center">
          <svg aria-hidden="true" className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="2.5" width="10" height="19" rx="2" />
            <path d="M11 18.5h2" />
            <path d="M20.5 9a8.5 8.5 0 0 0-3-5.5M20.5 9l-2.6-.6M20.5 9l.6-2.6" />
          </svg>
          <p className="text-base font-semibold">Turn your phone upright to annotate.</p>
        </div>
      )}
    </div>
  );
}
