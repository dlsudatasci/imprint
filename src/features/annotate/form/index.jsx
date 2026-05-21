import { useState } from "react";
import { createPortal } from "react-dom";
import { ReactPictureAnnotation } from "@/ui/annotation-tool/index";
import { useSession } from "next-auth/react";

export default function AnnotateForm({ data, current, total }) {
  const onSelect = () => { };
  const onChange = () => { };
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const [showAbandonModal, setShowAbandonModal] = useState(false);

  if (typeof window !== "undefined" && loading) return null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Top Actions */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowAbandonModal(true)}
          className="text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors text-sm font-semibold border border-gray-200 hover:border-gray-400 rounded-full px-4 py-2"
        >
          Stop Session
        </button>
      </div>

      {/* Stop Confirmation Modal */}
      {showAbandonModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm font-sans antialiased">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 transform transition-all text-left">
            <h3 className="text-2xl font-bold text-accent mb-3">Stop Session?</h3>
            <p className="text-gray-500 mb-8 leading-relaxed">
              Are you sure you want to stop this session? Images you have already submitted will be saved, but progress on current image will be lost.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowAbandonModal(false)}
                className="transition-all duration-500 ease-in-out font-semibold py-3 px-6 text-sm rounded-[2rem] border hover:-translate-y-0.5 hover:shadow-md border-gray-200 text-accent hover:border-accent bg-white whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await fetch("/api/annotationAbandon", { method: "POST" });
                    localStorage.removeItem("annotationCurrentCount");
                    localStorage.removeItem("annotationTotalCount");
                    localStorage.removeItem("annotationSetData");
                    window.location.href = "/contribute";
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="transition-all duration-500 ease-in-out font-semibold py-3 px-6 text-sm rounded-[2rem] border hover:-translate-y-0.5 hover:shadow-md bg-primary border-primary text-white hover:bg-opacity-90 whitespace-nowrap"
              >
                Yes, Stop Session
              </button>
            </div>
          </div>
        </div>,
        document.querySelector('main') || document.body
      )}

      {/* Progress Bar */}
      <div className="mb-10">
        <div className="flex items-center justify-center max-w-4xl mx-auto w-full">
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
                  <div className="flex items-center text-gray-400 font-bold mr-4 text-sm whitespace-nowrap">
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
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${isCurrent
                              ? "bg-primary text-white shadow-md shadow-primary/30 scale-110 ring-4 ring-blue-100"
                              : isCompleted
                                ? "bg-primary text-white"
                                : "bg-gray-200 text-gray-500"
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
                        <div className="flex-1 h-[3px] mx-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${isCompleted ? "bg-primary w-full" : "w-0"
                              }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {hasMoreNext && (
                  <div className="flex items-center text-gray-400 font-bold ml-4 text-sm whitespace-nowrap">
                    {end + 1} &rarr;
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Title */}
      <h1 className="text-4xl lg:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#004aad] to-indigo-500 text-center tracking-tight mb-8">
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
        currentAnnotationCount={current}
        totalAnnotationCount={total}
        username={session.user.username}
      />
    </div>
  );
}
