import { useRef, useState, useEffect, useCallback } from "react";
import { writeCurrentCount } from "@/util/sessionCache";
import { PauseIcon, StopIcon } from "@/ui/icons";

/**
 * Netflix-style scrollable image strip showing annotation progress.
 *
 * Each image in the session is a thumbnail card with a numbered circle overlay.
 * Completed images (green circle) are clickable to navigate back; future images
 * (gray circle) are not. Left/right arrows scroll the strip and hide at the edges.
 */
export default function ProgressStrip({ images, current, onPause, onStop, isTutorial = false }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const currentCard = el.querySelector(`[data-index="${current - 1}"]`);
    if (currentCard) {
      currentCard.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
    }
  }, [current]);

  const scroll = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.querySelector("[data-index]")?.offsetWidth || 200;
    el.scrollBy({ left: direction * cardWidth * 3, behavior: "smooth" });
  };

  const navigateTo = async (index) => {
    const target = index + 1;
    if (target >= current) return;
    writeCurrentCount(target);
    try {
      await fetch("/api/updateSessionCount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentAnnotationCount: target }),
      });
    } catch (e) {
      console.error(e);
    }
    sessionStorage.setItem("isNavigatingImages", "true");
    window.location.reload();
  };

  const fewImages = images.length <= 7;

  return (
    <div className="mb-6">
      {/* Session controls — visually grouped with gray background. The panel
          fits its contents (snug around a 5-image session or the 3-image
          tutorial) and grows to the full width only when the thumbnails need
          to scroll (2 Oct 2026). */}
      <div className="w-fit max-w-full mx-auto bg-gray-300 border border-gray-400 rounded-card px-4 py-3">
      {/* Strip with arrows */}
      <div className="relative flex items-center gap-2">
        {/* Left arrow — hidden when few enough images to center */}
        {!fewImages && (
          <button
            onClick={() => scroll(-1)}
            className={`shrink-0 w-8 h-8 rounded-full border border-line bg-surface shadow-sm flex items-center justify-center transition-opacity ${
              canScrollLeft ? "opacity-100 hover:bg-surface-subtle" : "opacity-0 pointer-events-none"
            }`}
            aria-label="Scroll left"
          >
            <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Scrollable strip */}
        <div
          ref={scrollRef}
          className={`flex-1 overflow-x-auto scrollbar-hide ${fewImages ? "" : ""}`}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {/* Centred with auto margins rather than justify-center, which would
              cut off the first thumbnails if they ever overflow. */}
          <div className={`flex gap-2 py-1 ${fewImages ? "w-fit mx-auto" : ""}`}>
            {images.map((img, i) => {
              const isCompleted = i < current - 1;
              const isCurrent = i === current - 1;
              const canClick = isCompleted;

              return (
                <button
                  key={i}
                  data-index={i}
                  disabled={!canClick}
                  onClick={() => canClick && navigateTo(i)}
                  className={`shrink-0 relative rounded-lg overflow-hidden border-2 transition-all ${
                    isCurrent
                      ? "border-primary ring-2 ring-primary/30 shadow-md"
                      : isCompleted
                        ? "border-success/50 hover:border-success hover:shadow-md cursor-pointer"
                        : "border-line opacity-60 cursor-default"
                  }`}
                  style={{ width: 140, height: 88 }}
                >
                  {/* Thumbnail */}
                  <img
                    src={img.url}
                    alt={`Sidewalk ${i + 1}`}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />

                  {/* Darkening overlay */}
                  <div className={`absolute inset-0 ${
                    isCurrent ? "bg-black/20" : isCompleted ? "bg-black/30" : "bg-black/40"
                  }`} />

                  {/* Number circle */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${
                      isCompleted
                        ? "bg-success text-white"
                        : isCurrent
                          ? "bg-white text-ink"
                          : "bg-white/70 text-muted"
                    }`}>
                      {isCompleted ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right arrow — hidden when few enough images to center */}
        {!fewImages && (
          <button
            onClick={() => scroll(1)}
            className={`shrink-0 w-8 h-8 rounded-full border border-line bg-surface shadow-sm flex items-center justify-center transition-opacity ${
              canScrollRight ? "opacity-100 hover:bg-surface-subtle" : "opacity-0 pointer-events-none"
            }`}
            aria-label="Scroll right"
          >
            <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Pause / Stop below the strip */}
      <div className="flex justify-center gap-2 mt-3">
        {!isTutorial && (
          <button
            onClick={onPause}
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-body transition-colors px-3 py-1.5 rounded-control border border-line hover:border-primary/30 bg-surface"
          >
            <PauseIcon size={14} />
            Pause Session
          </button>
        )}
        <button
          onClick={onStop}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-danger transition-colors px-3 py-1.5 rounded-control border border-line hover:border-danger/30 bg-surface"
        >
          <StopIcon size={14} />
          {isTutorial ? "Stop Tutorial" : "Stop Session"}
        </button>
      </div>
      </div>{/* end session controls panel */}
    </div>
  );
}
