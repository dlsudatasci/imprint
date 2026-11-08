import { useRef, useState, useEffect, useCallback } from "react";
import { requestImage } from "@/util/imageNavigation";
import { HelpIcon, PauseIcon, StopIcon } from "@/ui/icons";

/**
 * Netflix-style scrollable image strip showing annotation progress.
 *
 * Each image in the session is a thumbnail card with a numbered circle overlay.
 * Completed images (green circle) are clickable to navigate back; future images
 * (gray circle) are not. Left/right arrows scroll the strip and hide at the edges.
 *
 * The thumbnails are the session's full-size photos. With `deferUpcoming`
 * (S16, 3 Nov 2026, while the current photo loads) the images still to come
 * are drawn as their numbered grey card, with no photo, so they do not take
 * the connection from the current one. The current image's thumbnail is the
 * same url as the photo, and the completed ones are cached, so those show at
 * once and nothing flickers on Next Image. Every thumbnail loads at low
 * priority.
 *
 * In the tutorial, `onShowTour` adds a ? button beside Stop Tutorial that runs
 * the tour again (S16b, 3 Nov 2026, in place of the beacons on each point), as
 * the phone's top bar has.
 *
 * `reached` (6 Nov 2026, the tutorial and every session): the furthest image
 * reached. After going back, the images up to it stay as they were: those
 * before it done, and every one of them can be opened, forward as well as
 * back. Without it, only the images before the one on screen are done.
 *
 * A click asks the annotation tool for the image (imageNavigation.js): the
 * tool sends the image on screen again first if it was already sent and has
 * changed since, so no answer is left only in this browser.
 */
export default function ProgressStrip({ images, current, reached, onPause, onStop, onShowTour, tourButton = null, isTutorial = false, deferUpcoming = false }) {
  const furthest = Math.max(current, reached ?? current);
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

  const navigateTo = (index) => {
    const target = index + 1;
    if (target === current || target > furthest) return;
    requestImage(target);
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
              const isCurrent = i === current - 1;
              const isCompleted = !isCurrent && i < furthest - 1;
              // The furthest image, reached but not done, when it is not on screen
              const isReached = !isCurrent && i === furthest - 1;
              const canClick = isCompleted || isReached;

              return (
                <button
                  key={i}
                  data-index={i}
                  disabled={!canClick}
                  onClick={() => canClick && navigateTo(i)}
                  className={`shrink-0 relative rounded-lg overflow-hidden border-2 bg-surface-subtle transition-all ${
                    isCurrent
                      ? "border-primary ring-2 ring-primary/30 shadow-md"
                      : isCompleted
                        ? "border-success/50 hover:border-success hover:shadow-md cursor-pointer"
                        : isReached
                          ? "border-line hover:border-primary hover:shadow-md cursor-pointer"
                          : "border-line opacity-60 cursor-default"
                  }`}
                  style={{ width: 140, height: 88 }}
                >
                  {/* Thumbnail, not yet for an image still to come while the photo loads */}
                  {!(deferUpcoming && i > furthest - 1) && (
                    <img
                      src={img.url}
                      alt={`Sidewalk ${i + 1}`}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                    />
                  )}

                  {/* Darkening overlay */}
                  <div className={`absolute inset-0 ${
                    isCurrent ? "bg-black/20" : isCompleted || isReached ? "bg-black/30" : "bg-black/40"
                  }`} />

                  {/* Number circle */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${
                      isCompleted
                        ? "bg-success text-white"
                        : isCurrent || isReached
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

      {/* Pause / Stop below the strip, and the tutorial's tour */}
      <div className="flex justify-center gap-2 mt-3">
        {onShowTour && (
          // eslint-disable-next-line react/forbid-elements -- the same pill as Pause and Stop beside it
          <button
            onClick={onShowTour}
            // The tutorial's first image names it Practice: it does the practice again (S19)
            title={tourButton?.title ?? "Show the tour"}
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-body transition-colors px-3 py-1.5 rounded-control border border-line hover:border-primary/30 bg-surface"
          >
            <HelpIcon size={14} />
            {tourButton?.label ?? "Tour"}
          </button>
        )}
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
