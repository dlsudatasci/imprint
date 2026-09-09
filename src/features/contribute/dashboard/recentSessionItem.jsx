import { Button, ConfirmDialog } from "@/ui";
import React, { useState } from "react";
import Link from "next/link";
import { clearSession } from "@/util/sessionCache";

/**
 * One row in the dashboard's session history.
 *
 * Renders two ways. A finished session shows its results: the obstruction
 * sparkline and average accessibility score. The active session shows Resume
 * and Stop instead, since what matters there is getting back to work.
 *
 * There is at most one active session, and /api/recentSessions puts it first.
 */
export default function RecentSessionItem({ sessionData }) {
  const { isActive, currentCount, date, location, totalImages, imageUrls, chartData = [], averageScore } = sessionData;
  const [showAbandonModal, setShowAbandonModal] = useState(false);

  const handleStopSession = async () => {
    try {
      await fetch("/api/annotationAbandon", { method: "POST" });
      clearSession();
      // Full reload so getServerSideProps re-reads the updated annotation total
      window.location.reload();
    } catch (e) {
      console.error(e);
    }
  };

  const jsDate = new Date(date);
  const options = {
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  const stringDate = jsDate.toLocaleDateString("en-US", options);

  // Score Color Logic based on theme (Primary: #004aad, Gold for high)
  const numericScore = parseFloat(averageScore);
  let scoreBg = "bg-line text-body";
  if (numericScore >= 8) {
    scoreBg = "bg-primary text-white"; // High
  } else if (numericScore >= 5) {
    scoreBg = "bg-primary-100 text-primary"; // Mid
  } else if (numericScore > 0) {
    scoreBg = "bg-line text-ink"; // Low
  }

  // Bars scale against this session's own busiest image, not a global maximum —
  // the shape of the run is what's interesting, not cross-session comparison.
  // The 1 floor keeps an all-zero session from dividing by zero.
  const maxAnnotations = Math.max(...chartData, 1);

  return (
    <li className="border-b border-line-card py-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-transparent">

      {/* Left: Date, Location, and Images */}
      <div className="flex flex-col gap-3 flex-1">
        <div>
          <p className="text-sm text-muted font-semibold uppercase tracking-wider">
            {stringDate} • {location}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {imageUrls.map((url, idx) => (
            <div key={idx} className="w-14 h-14 relative rounded-control overflow-hidden border border-line bg-surface-subtle">
              {url ? (
                /* eslint-disable-next-line @next/next/no-img-element -- remote dataset URLs aren't on a configured next/image domain */
                <img src={url} alt={`Annotation ${idx}`} className="object-cover w-full h-full" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-subtle text-xs">IMG</div>
              )}
            </div>
          ))}
          {totalImages > 3 && (
            <div className="w-14 h-14 rounded-control bg-surface-subtle border border-line flex items-center justify-center font-bold text-body">
              +{totalImages - 3}
            </div>
          )}
        </div>
      </div>

      {/* Right: Chart and Score OR Active Session Buttons */}
      <div className="flex items-center justify-end gap-8 w-full md:w-auto mt-4 md:mt-0">

        {isActive ? (
          <div className="flex flex-row space-x-3 w-full justify-end">
            <Button variant="neutral" size="sm" onClick={() => setShowAbandonModal(true)}>
              Stop Session
            </Button>
            <Link href="/contribute/annotate" className="flex">
              <Button size="sm" className="whitespace-nowrap">
                {/* currentCount is the image they're *on*, so subtract one to
                    show images finished. Clamped at 0 for a session where they
                    haven't submitted anything yet. */}
                Resume Session ({Math.max(0, currentCount - 1)}/{totalImages})
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Bar Chart */}
            <div className="flex flex-col items-center">
              <p className="text-[10px] font-bold text-subtle uppercase tracking-widest mb-2">Obstruction Density</p>
              <div className="flex items-end gap-1 h-10 border-b border-line-card pb-px">
                {chartData.map((val, idx) => {
                  const heightPercent = Math.max((val / maxAnnotations) * 100, 5); // min 5% height for visibility
                  return (
                    <div key={idx} className="w-3 relative group flex items-end h-full">
                      <div
                        className="w-full bg-primary/60 rounded-t-sm group-hover:bg-primary transition-colors duration-300"
                        style={{ height: `${heightPercent}%` }}
                      ></div>
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 transform -translate-x-1/2 bg-ink text-white text-[10px] px-2 py-1 rounded pointer-events-none transition-opacity z-10">
                        {val}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Average Score */}
            <div className="flex flex-col items-center justify-center">
              <p className="text-[10px] font-bold text-subtle uppercase tracking-widest mb-1">Avg Score</p>
              <div className={`w-14 h-14 rounded-control flex items-center justify-center text-xl font-extrabold border border-line ${scoreBg}`}>
                {numericScore > 0 ? numericScore : "-"}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Stop Confirmation Modal */}
      <ConfirmDialog
        open={showAbandonModal}
        title="Stop Session?"
        description="Are you sure you want to stop this session? Images you have already submitted will be saved, but progress on the current image will be lost."
        confirmLabel="Yes, Stop Session"
        destructive
        onCancel={() => setShowAbandonModal(false)}
        onConfirm={handleStopSession}
      />
    </li>
  );
}
