import { ConfirmDialog, Container } from "@/ui";
import { useState } from "react";
import { ReactPictureAnnotation } from "@/ui/annotation-tool/index";
import { useSession } from "next-auth/react";
import { clearSession } from "@/util/sessionCache";
import ProgressStrip from "@/features/annotate/ProgressStrip";

export default function AnnotateForm({ data, current, total, allImages, isTutorial = false }) {
  const onSelect = () => { };
  const onChange = () => { };
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const [showAbandonModal, setShowAbandonModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);

  if (loading) return null;

  return (
    <Container width="wide" className="py-3">
      <ConfirmDialog
        open={showPauseModal}
        title="Pause Session?"
        description="Your submitted images are already saved. You can resume this session anytime — you'll pick up right where you left off."
        confirmLabel="Pause & Exit"
        onCancel={() => setShowPauseModal(false)}
        onConfirm={async () => {
          try {
            await fetch("/api/updateSessionCount", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ currentAnnotationCount: current }),
            });
            clearSession();
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
      />
    </Container>
  );
}
