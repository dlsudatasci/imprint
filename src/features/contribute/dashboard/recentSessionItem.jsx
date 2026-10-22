import Link from "next/link";
import { DASHBOARD_COPY as COPY, accessWord, sessionDate } from "./dashboardCopy";
import { chartColumns, chartSummary, MAX_CHART_COLUMNS } from "./sessionChart";

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
 *   now counts obstructions, boxes answered Yes (countObstructions).
 * - "Avg Score" did not say which question it averaged, and on a scale where
 *   1 is best the number read backwards. It is now "Accessible to me" with
 *   the nearest answer word ("Mostly accessible"), still color-coded
 *   (chapter_5.tex).
 * - The active row repeated the page's own Resume and Stop buttons. It now
 *   shows its progress and a Resume link. Stopping is done once, at the top
 *   of the page, behind a confirmation.
 * - Dates in Philippine time, city names as people write them, labels in
 *   sentence case, thumbnails decorative.
 *
 * Laid out again 22 Oct 2026 (dataviz and apple-design passes):
 * - The cities are named ("Makati, San Juan and 2 more"), the whole list on
 *   hover. It said "Several cities".
 * - The chart says what it counts in words (SessionChart). It was five
 *   averaged columns. Then (Rans) compact again, as before: a column a photo
 *   up to ten, ten groups past that, in the middle of a plot ten columns
 *   wide, and no Photo 1 to Photo n under it.
 * - Five thumbnails from 1024 px, four on a phone or tablet, the +n counting the rest.
 * - Accessible to me only when the list has it (`showAccess`): annotators
 *   answer no scene-level questions, so it was an empty column beside every
 *   one of their sessions. Then the chart takes its space. A session without
 *   it, in a list with it, says why.
 * - The chart (10 rem) and the answer (8 rem) keep the same width down the list.
 * - Accessible to me runs 1 Not accessible to 5 Easily accessible from 22 Oct
 *   2026 (validators/sceneScale.mjs), so the darkest tile is now the highest.
 *
 * Proportioned 22 Oct 2026 (Rans: the thumbnails and Accessible to me looked
 * small beside the chart, and out of line with it): the thumbnails up to 72
 * px (92 looked daunting on a laptop) and Accessible to me's tile 64 px on
 * the chart's baseline. Each column is a label (the date level with
 * "Obstructions found" and "Accessible to me", those two centred), the 72 px
 * picture, then a caption under it: the cities under the thumbnails, the
 * total under the chart, the answer word under the number, so nothing hangs
 * below the rest. Side by side
 * from 768 px, as on a laptop (four thumbnails and a +n on a tablet, sharing
 * the row where 72 px do not fit); on
 * a phone Accessible to me beside the chart, under the thumbnails, the chart
 * as wide as is left (its columns a little thinner on a 360 px phone).
 */

// The chart's plot and Accessible to me's tile sit in a 72 px band, their
// captions under it
const VISUAL_H = "h-[4.5rem]";
// Thumbnails: 72 px, the band's height, in slots of one size whatever the
// number of photos (one photo is as big as one of ten): four and a +n on a
// phone or tablet, five and a +n from 1024 px. Where the slots do not have
// 72 px (a phone, a tablet) they share the row.
const SLOTS = "grid grid-cols-[repeat(5,minmax(0,4.5rem))] gap-2 lg:grid-cols-[repeat(6,minmax(0,4.5rem))]";
const TILE = "relative aspect-square w-full overflow-hidden rounded-control border border-line bg-surface-subtle";
const MORE_TILE = "aspect-square w-full items-center justify-center rounded-control border border-line bg-surface-subtle text-sm font-bold text-body tabular-nums";
const LABEL = "text-xs font-semibold text-muted";
// Every column of a finished session is a label on top, its 72 px picture 8
// px under it, and (the chart and Accessible to me) a caption under that. The
// labels sit in boxes of one height, so the date lines up with "Obstructions
// found" and every picture starts at the same height.
const LABEL_ROW = "flex h-5 items-end";
const CAPTION = "mt-1 text-center text-xs text-muted";

function Thumbnails({ imageUrls, totalImages }) {
  const shown = imageUrls.slice(0, 5);
  // A phone or a tablet shows four of them
  const restNarrow = totalImages - Math.min(shown.length, 4);
  const restWide = totalImages - shown.length;
  return (
    <div className={SLOTS}>
      {shown.map((url, idx) => (
        <div key={idx} className={`${TILE}${idx === 4 ? " hidden lg:block" : ""}`}>
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element -- remote dataset URLs aren't on a configured next/image domain */
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
      ))}
      {restNarrow > 0 && <div className={`${MORE_TILE} flex lg:hidden`}>+{restNarrow}</div>}
      {restWide > 0 && <div className={`${MORE_TILE} hidden lg:flex`}>+{restWide}</div>}
    </div>
  );
}

/**
 * Obstructions found, photo by photo. A column chart, one series in the brand
 * blue, so no legend: the label says what is counted and the caption under it
 * the total. Columns 12 px wide in 16 px slots, so 4 px apart, their tops rounded
 * 4 px on one baseline; a column a photo up to ten, ten groups of neighbouring
 * photos past that (sessionChart.js). The plot is always ten slots wide, so the
 * charts line up down the list, and a session of fewer photos sits in its
 * middle. The tallest column is the one in full blue, its count on its cap.
 * Pointing at a column fills it and fades in its count and photos above it,
 * kept inside the plot; the same counts are in a table for screen readers.
 */
function SessionChart({ counts }) {
  const columns = chartColumns(counts);
  const { total, photos, peak } = chartSummary(counts, columns);
  const max = peak ? peak.mean : 0;
  const words = total > 0 ? COPY.chartSummary(total, photos) : COPY.chartNone(photos);
  // Where the columns start in the ten slots, when there are fewer than ten
  const offset = (MAX_CHART_COLUMNS - columns.length) / 2;
  return (
    <div className="min-w-0" data-session-chart>
      <div className={`${LABEL_ROW} justify-center`}>
        <p className={LABEL}>{COPY.chartLabel}</p>
      </div>
      {photos > 0 && (
        <>
          {/* 16 px of headroom above the columns for the tallest one's count */}
          {/* 160 px from 768 px; on a phone, beside Accessible to me, as wide as is left */}
          <div className={`relative mx-auto mt-2 w-full max-w-40 md:w-40 ${VISUAL_H}`} aria-hidden="true">
            <div className="absolute inset-x-0 bottom-0 top-4 flex items-end justify-center border-b border-line">
              {columns.map((column, i) => {
                const height = max > 0 ? (column.mean / max) * 100 : 0;
                const isPeak = peak !== null && column.from === peak.from;
                // The count stays inside the row: from its column's left in
                // the plot's first third, its right in the last, centred between
                const at = (offset + i + 0.5) / MAX_CHART_COLUMNS;
                const align = at < 1 / 3 ? "left-0" : at > 2 / 3 ? "right-0" : "left-1/2 -translate-x-1/2";
                return (
                  <div key={column.from} className="group relative flex h-full min-w-0 max-w-4 flex-1 items-end justify-center" data-chart-slot>
                    {column.value > 0 && (
                      <div
                        className={`w-3 max-w-[75%] rounded-t-[4px] transition-colors duration-150 ${isPeak ? "bg-primary" : "bg-primary/45 group-hover:bg-primary"}`}
                        style={{ height: `${Math.max(height, 10)}%` }}
                      />
                    )}
                    {isPeak && (
                      <span
                        className="absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold leading-none text-ink tabular-nums"
                        style={{ bottom: `calc(${Math.max(height, 10)}% + 3px)` }}
                        data-chart-peak
                      >
                        {column.value}
                      </span>
                    )}
                    {/* Two short lines, under 110 px, so anchored this way it
                        never leaves the plot's 160 px */}
                    <div
                      className={`pointer-events-none absolute bottom-full z-10 mb-1 flex flex-col whitespace-nowrap rounded-control bg-ink px-2 py-1 text-[11px] leading-tight text-white opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 motion-reduce:transition-none ${align}`}
                      data-chart-tip
                    >
                      <span className="font-semibold">{COPY.chartCount(column.value)}</span>
                      <span className="text-white/70">{COPY.chartPhoto(column.from, column.to)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <table className="sr-only">
            <caption>{COPY.chartTableCaption}</caption>
            <tbody>
              {columns.map((column) => (
                <tr key={column.from}>
                  <th scope="row">{COPY.chartPhoto(column.from, column.to)}</th>
                  <td>{COPY.chartCount(column.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {/* The total under the chart, as the answer word is under Accessible to me's number */}
      <p className={`${CAPTION} tabular-nums`} data-chart-line>{words}</p>
    </div>
  );
}

/**
 * The average Accessible to Me answer: the number on its color, and the
 * answer word nearest it under it, both centred in the column.
 */
function Access({ averageScore }) {
  const numericScore = parseFloat(averageScore);
  const has = averageScore != null && numericScore > 0;
  const word = has ? accessWord(numericScore) : null;
  // 5 is Easily accessible and 1 Not accessible, so higher is better (22 Oct 2026)
  let scoreClass = "bg-surface-subtle text-subtle";
  if (has && numericScore >= 4) scoreClass = "bg-primary text-white";
  else if (has && numericScore >= 2.5) scoreClass = "bg-primary-100 text-primary";
  else if (has) scoreClass = "bg-line text-ink";
  return (
    <div className="min-w-0" data-session-access>
      <div className={`${LABEL_ROW} justify-center`}>
        <p className={LABEL}>{COPY.accessLabel}</p>
      </div>
      <div className="mt-2 flex flex-col items-center">
        {/* A 64 px tile on the band's floor, level with the chart's baseline */}
        <div className={`flex w-full items-end justify-center ${VISUAL_H}`}>
          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-control border border-line text-xl font-extrabold tabular-nums ${scoreClass}`} data-access-tile>
            {has ? numericScore : "–"}
          </div>
        </div>
        <p className={CAPTION}>{has ? word : COPY.accessNone}</p>
      </div>
    </div>
  );
}

export default function RecentSessionItem({ sessionData, showAccess = true }) {
  const { isActive, currentCount, date, location, cities = [], totalImages, imageUrls = [], chartData = [], averageScore } = sessionData;

  // currentCount is the photo they are on, so one less is the number done
  const done = Math.max(0, (currentCount || 1) - 1);
  const meta = [sessionDate(date), COPY.inProgress].join(" · ");
  const citiesTitle = cities.length > 1 ? cities.join(", ") : undefined;
  // The chart's ten columns of 16 px are 10 rem. The session in progress
  // keeps the chart's and the answer's width either way, so its count and
  // Resume Session stay on one line.
  let columns = showAccess ? "md:grid-cols-[minmax(0,1fr)_10rem_8rem]" : "md:grid-cols-[minmax(0,1fr)_10rem]";
  if (isActive) columns = "md:grid-cols-[minmax(0,1fr)_20rem]";

  return (
    <li className={`grid gap-5 border-b border-line-card py-5 last:border-b-0 md:items-start md:gap-8 ${columns}`}>
      {isActive ? (
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm font-semibold text-primary">{meta}</p>
          <Thumbnails imageUrls={imageUrls} totalImages={totalImages} />
        </div>
      ) : (
        // A finished session: the date level with "Obstructions found", the
        // thumbnails where the chart starts, and from 768 px the cities under
        // them as the total and the answer word are under theirs
        <div className="min-w-0">
          {/* On a phone the cities stay beside the date, as before, and the
              line may wrap; from 768 px it is the date alone, in the label box */}
          <div className="md:flex md:h-5 md:items-end">
            <p className="text-sm font-semibold text-muted" title={citiesTitle}>
              {sessionDate(date)}
              <span className="md:hidden"> · {location}</span>
            </p>
          </div>
          {/* In the 72 px band, on its floor, so where the thumbnails are
              smaller (a tablet) the cities still line up with the captions */}
          <div className="mt-2 md:grid md:h-[4.5rem] md:content-end">
            <Thumbnails imageUrls={imageUrls} totalImages={totalImages} />
          </div>
          {/* The whole list of cities on hover, when the line names only some */}
          <p className="mt-1 hidden text-xs text-muted md:block" title={citiesTitle} data-session-place>
            {location}
          </p>
        </div>
      )}

      {isActive ? (
        <div className="flex flex-col gap-3 md:pt-7" data-session-progress>
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
        // On a phone Accessible to me sits beside the chart, under the
        // thumbnails. Each keeps its label on one line (the chart's is 115 px,
        // Accessible to me's 101 px), which fits a 360 px phone's 230 px row.
        // The chart's column is never wider than the chart, so it starts
        // under the thumbnails on a wide phone, not centred in empty space.
        <div className={`${showAccess ? "grid grid-cols-[minmax(7.25rem,10rem)_minmax(6.5rem,1fr)] items-start gap-2" : ""} md:contents`}>
          <SessionChart counts={chartData} />
          {showAccess && <Access averageScore={averageScore} />}
        </div>
      )}
    </li>
  );
}
