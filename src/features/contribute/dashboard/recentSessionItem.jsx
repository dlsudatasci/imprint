import Link from "next/link";
import { DASHBOARD_COPY as COPY, accessWord, sessionDate } from "./dashboardCopy";

/**
 * One row in the dashboard's session history.
 *
 * Renders two ways. A finished session shows its results: an obstruction
 * chart and the average "Accessible to Me" answer. The active session shows
 * how far it got and a link back into it.
 *
 * There is at most one active session, and /api/recentSessions puts it first.
 *
 * Audited 17 Oct 2026 (IMPRINT_dashboard_audit.md):
 * - The chart counted every box ruled on, No and Not an object included. It
 *   now counts obstructions, boxes answered Yes (countObstructions), and is
 *   labelled "Obstructions per photo".
 * - "Avg Score" did not say which question it averaged, and on a scale where
 *   1 is best the number read backwards. It is now "Accessible to me" with
 *   the nearest answer word ("Mostly accessible"), still color-coded
 *   (chapter_5.tex).
 * - The active row repeated the page's own Resume and Stop buttons. It now
 *   shows its progress and a Resume link. Stopping is done once, at the top
 *   of the page, behind a confirmation.
 * - Dates in Philippine time, city names as people write them, labels in
 *   sentence case, thumbnails decorative.
 * - Laid out on a grid from 768 px (apple-design pass): the chart and the
 *   answer sit in fixed columns with their labels on one line, so rows line
 *   up down the list. They used to float at different heights. The active
 *   session shows a small progress bar beside its count.
 */
export default function RecentSessionItem({ sessionData }) {
  const { isActive, currentCount, date, location, totalImages, imageUrls = [], chartData = [], averageScore } = sessionData;

  const numericScore = parseFloat(averageScore);
  const word = accessWord(numericScore);

  // 1 is Easily accessible and 5 Not accessible, so lower is better
  let scoreClass = "bg-line text-body";
  if (numericScore > 0 && numericScore <= 2) scoreClass = "bg-primary text-white";
  else if (numericScore > 2 && numericScore <= 3.5) scoreClass = "bg-primary-100 text-primary";
  else if (numericScore > 3.5) scoreClass = "bg-line text-ink";

  // Bars scale against this session's own busiest photo, since the shape of
  // the run is the point. The 1 floor keeps an all-zero session from dividing by zero.
  const maxCount = Math.max(...chartData, 1);
  // currentCount is the photo they are on, so one less is the number done
  const done = Math.max(0, (currentCount || 1) - 1);
  const meta = [sessionDate(date), isActive ? COPY.inProgress : location].filter(Boolean).join(" · ");

  const label = "text-xs font-semibold text-muted";

  return (
    <li className="grid gap-5 border-b border-line-card py-5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_10rem_7rem] md:items-start md:gap-8">
      <div className="flex min-w-0 flex-col gap-3">
        <p className={`text-sm font-semibold ${isActive ? "text-primary" : "text-muted"}`}>{meta}</p>
        <div className="flex items-center gap-2">
          {imageUrls.map((url, idx) => (
            <div key={idx} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-control border border-line bg-surface-subtle">
              {url ? (
                /* eslint-disable-next-line @next/next/no-img-element -- remote dataset URLs aren't on a configured next/image domain */
                <img src={url} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
          ))}
          {totalImages > 3 && (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-control border border-line bg-surface-subtle font-bold text-body tabular-nums">
              +{totalImages - 3}
            </div>
          )}
        </div>
      </div>

      {isActive ? (
        <div className="flex flex-col gap-3 md:col-span-2 md:pt-7" data-session-progress>
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm text-body tabular-nums">{COPY.progress(done, totalImages)}</p>
            <Link
              href="/contribute/annotate"
              className="rounded-control text-sm font-semibold text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {COPY.resumeSession}
            </Link>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle ring-1 ring-inset ring-line" aria-hidden="true">
            <div className="h-full rounded-full bg-primary" style={{ width: `${totalImages ? (done / totalImages) * 100 : 0}%` }} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6 md:contents">
          <div data-session-chart>
            <p className={label}>{COPY.chartLabel}</p>
            <div className="mt-2 flex h-14 items-end gap-1 border-b border-line-card pb-px">
              {chartData.map((val, idx) => {
                const heightPercent = Math.max((val / maxCount) * 100, 5); // at least 5% so a zero still shows
                return (
                  <div key={idx} className="group relative flex h-full w-3 items-end">
                    <div className="w-full rounded-t-sm bg-primary/60 transition-colors duration-300 group-hover:bg-primary" style={{ height: `${heightPercent}%` }} />
                    <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 rounded bg-ink px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {val}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Empty when the session has no accessibility answers (annotators, or only photos with no sidewalk) */}
          <div data-session-access>
            {averageScore != null && numericScore > 0 && (
              <>
                <p className={label}>{COPY.accessLabel}</p>
                <div className="mt-2 flex items-center gap-3 md:flex-col md:items-start md:gap-1">
                  <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-control border border-line text-xl font-extrabold tabular-nums ${scoreClass}`}>
                    {numericScore}
                  </div>
                  {word && <p className="text-xs text-muted">{word}</p>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
