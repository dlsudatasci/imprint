import { Button, ConfirmDialog, Container } from "@/ui";
import { useState } from "react";
import { ReactPictureAnnotation } from "@/ui/annotation-tool/index";
import { useSession } from "next-auth/react";
import { clearSession } from "@/util/sessionCache";

/**
 * The frame around the annotation canvas: progress bar, stop-session dialog,
 * and the annotation tool itself.
 *
 * The tutorial renders this same component and intercepts its network calls, so
 * nothing is saved during practice. Keeping one code path means the walkthrough
 * always matches the real task.
 */
export default function AnnotateForm({ data, current, total }) {
  const onSelect = () => { };
  const onChange = () => { };
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const [showAbandonModal, setShowAbandonModal] = useState(false);

  // No `typeof window` branch here: rendering different trees on the server and
  // on the client is precisely what breaks hydration. `loading` is true on both
  // for the first render, so gating on it alone is consistent.
  if (loading) return null;

  return (
    <Container className="py-8">
      {/* Top Actions */}
      <div className="flex justify-end mb-4">
        <Button variant="neutral" size="sm" onClick={() => setShowAbandonModal(true)}>
          Stop Session
        </Button>
      </div>

      <ConfirmDialog
        open={showAbandonModal}
        title="Stop Session?"
        description="Are you sure you want to stop this session? Images you have already submitted will be saved, but progress on the current image will be lost."
        confirmLabel="Yes, Stop Session"
        destructive
        onCancel={() => setShowAbandonModal(false)}
        onConfirm={async () => {
          try {
            await fetch("/api/annotationAbandon", { method: "POST" });
            clearSession();
            window.location.href = "/contribute";
          } catch (e) {
            console.error(e);
          }
        }}
      />

      {/* Progress Bar */}
      <div className="mb-10">
        <div className="flex items-center justify-center max-w-4xl mx-auto w-full">
          {/* Windowed progress dots. A 40-image session can't show 40 of them
              side by side, so they're paged ten at a time with ← / → counts
              marking what's off either end. */}
          {(() => {
            const chunkSize = 10;
            const chunkIndex = Math.floor((current - 1) / chunkSize);
            const start = chunkIndex * chunkSize + 1;
            const end = Math.min(start + chunkSize - 1, total);
            const steps = Array.from({ length: end - start + 1 }, (_, i) => start + i);

            const hasMoreNext = end < total;
            const hasMorePrev = start > 1;

            return (
              <>
                {hasMorePrev && (
                  <div className="flex items-center text-subtle font-bold mr-4 text-sm whitespace-nowrap">
                    &larr; {start - 1}
                  </div>
                )}
                {steps.map((step, index) => {
                  const isCompleted = step < current;
                  const isCurrent = step === current;
                  const isLast = index === steps.length - 1;

                  return (
                    <div key={step} className="flex items-center flex-1 last:flex-none">
                      {/* Dot */}
                      <div className="relative flex flex-col items-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors duration-300 ${isCurrent
                              ? "bg-primary text-white ring-4 ring-primary-100"
                              : isCompleted
                                ? "bg-primary text-white"
                                : "bg-line text-muted"
                            }`}
                        >
                          {isCompleted ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            step
                          )}
                        </div>
                      </div>

                      {/* Connecting Line */}
                      {!isLast && (
                        <div className="flex-1 h-[3px] mx-2 bg-line rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${isCompleted ? "bg-primary w-full" : "w-0"
                              }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {hasMoreNext && (
                  <div className="flex items-center text-subtle font-bold ml-4 text-sm whitespace-nowrap">
                    {end + 1} &rarr;
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

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
        currentAnnotationCount={current}
        totalAnnotationCount={total}
        username={session?.user?.username ?? ""}
      />
    </Container>
  );
}
