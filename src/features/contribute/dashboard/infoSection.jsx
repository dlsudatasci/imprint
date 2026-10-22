import React from "react";
import RecentSessionItem from "./recentSessionItem";
import { Skeleton, Container, Button } from "@/ui";
import { metersForPhotos, nextMilestone, previousMilestone, stepProgress } from "@/util/milestones";
import { DASHBOARD_COPY as COPY, labelStart, secondsPerPhoto } from "./dashboardCopy";

// Sessions per page, as /api/recentSessions sends them (RECENT_SESSIONS_PAGE)
const SESSIONS_PAGE = 5;

/**
 * The lower half of the contributor dashboard: session history, the
 * distance-mapped banner, and personal contribution figures.
 *
 * Calls three endpoints in parallel rather than one combined route. They cost
 * very different amounts to compute, and a slow telemetry aggregation shouldn't
 * hold up the session list.
 *
 * For both roles. Annotators saw none of this section from 6 Oct 2026 (and no
 * Recent sessions from 4 Oct); from 21 Oct 2026 they see all of it again.
 * Their sessions have no accessibility average, which the rows leave empty.
 *
 * Audited 17 Oct 2026 (IMPRINT_dashboard_audit.md). Total contributions
 * counts photos (users.totalAnnotations grows by one per finished photo), not
 * obstructions as it said. The distance no longer says "safe" sidewalks, and
 * the ladder is reachable (util/milestones.js). The next landmark used to
 * read "the length of the length of ...". Headings run h2 under the page's h1.
 *
 * Laid out again the same day (apple-design pass): "Recent sessions" first
 * (Rans: the more important of the two), then "Your progress", the distance
 * and the three figures in one bordered card, since they answer the same
 * question. The distance was a full-width solid
 * blue block, the loudest thing on the page and louder than the one action
 * that matters (Let's Annotate!). It is now a number on a card, with the
 * brand blue kept for the bar. The bar runs from the last landmark passed to
 * the next, so it moves visibly with each session. The session list no
 * longer scrolls inside the page.
 */
export default class DashboardInfo extends React.Component {
  state = {
    recentSessions: [],
    // Show more and Show fewer (22 Oct 2026): whether older sessions are left,
    // how many rows the first page had, and the request for more
    hasMoreSessions: false,
    firstPageCount: 0,
    loadingMore: false,
    moreFailed: false,
    totalAnnotation: 0,
    sessionsFailed: false,
    username: this.props.username,
    userId: this.props.userId,
    telemetryStats: null,
    loading: true,
  };

  componentDidMount() {
    this.fetchData();
  }

  componentDidUpdate(prevProps) {
    // The session resolves after the first client render, so userId arrives a
    // beat late — refetch once it does rather than showing an empty dashboard
    if (prevProps.userId !== this.props.userId || prevProps.username !== this.props.username) {
      this.setState({ userId: this.props.userId, username: this.props.username }, () => {
        this.fetchData();
      });
    }
  }

  async fetchData() {
    if (!this.state.userId) return;

    try {
      const [extractUserRes, telemetryRes, recentSessionsRes] = await Promise.all([
        fetch("/api/extractUser", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        fetch("/api/telemetryStats"),
        fetch("/api/recentSessions")
      ]);

      // A failed request reads as null, not as an empty answer (17 Oct 2026).
      // Before, a failed /api/extractUser left Total contributions blank and a
      // failed list read as "no sessions yet".
      const read = (res) => (res.ok ? res.json().catch(() => null) : null);
      const [extractUser, telemetryStats, recentSessionsData] = await Promise.all([
        read(extractUserRes),
        read(telemetryRes),
        read(recentSessionsRes),
      ]);

      const firstPage = Array.isArray(recentSessionsData?.sessions) ? recentSessionsData.sessions : [];
      this.setState({
        recentSessions: firstPage,
        hasMoreSessions: recentSessionsData?.hasMore === true,
        firstPageCount: firstPage.length,
        moreFailed: false,
        sessionsFailed: !Array.isArray(recentSessionsData?.sessions),
        totalAnnotation: Number.isFinite(extractUser?.annotationCount) ? extractUser.annotationCount : null,
        telemetryStats: telemetryStats,
        loading: false,
      });
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
      this.setState({ loading: false, sessionsFailed: true, totalAnnotation: null, telemetryStats: null });
    }
  }

  /**
   * The next five finished sessions under those shown (22 Oct 2026). Show more
   * stays where it is, under the rows it added, for the next five.
   */
  loadMoreSessions = async () => {
    if (this.state.loadingMore) return;
    const offset = this.state.recentSessions.filter((session) => !session.isActive).length;
    this.setState({ loadingMore: true, moreFailed: false });
    try {
      const res = await fetch(`/api/recentSessions?offset=${offset}&limit=${SESSIONS_PAGE}`);
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (!Array.isArray(data?.sessions)) throw new Error("no sessions");
      const more = data.sessions.filter((session) => !session.isActive);
      this.setState((state) => ({
        recentSessions: [...state.recentSessions, ...more],
        hasMoreSessions: data.hasMore === true,
        loadingMore: false,
      }));
    } catch {
      this.setState({ loadingMore: false, moreFailed: true });
    }
  };

  /** Back to the first five; Show more is kept in view, where the finger was (22 Oct 2026). */
  showFewerSessions = () => {
    this.setState(
      (state) => ({ recentSessions: state.recentSessions.slice(0, state.firstPageCount), hasMoreSessions: true, moreFailed: false }),
      () => this.moreButton.current?.scrollIntoView?.({ block: "nearest" })
    );
  };

  moreButton = React.createRef();

  render() {
    const { totalAnnotation, recentSessions, sessionsFailed, telemetryStats, loading, hasMoreSessions, firstPageCount, loadingMore, moreFailed } = this.state;
    // Accessible to me is a contributor's Step 2 answer. Annotators give none,
    // so their list has no such column, and the chart takes its space
    // (22 Oct 2026). One session with it brings the column to every row.
    const showAccess = recentSessions.some((session) => !session.isActive && parseFloat(session.averageScore) > 0);
    const canShowFewer = recentSessions.length > firstPageCount;
    // null when its request failed: shown as "–" with the reason, never as 0
    const totalKnown = totalAnnotation != null;

    // Deliberately no zeroed fallback. A `0` that becomes `47` a moment later
    // reads as a real answer, so an unloaded figure renders as a skeleton.
    const stats = telemetryStats;

    const meters = metersForPhotos(totalAnnotation);
    const next = nextMilestone(meters);
    const previous = previousMilestone(meters);
    const progress = stepProgress(meters);
    const seconds = secondsPerPhoto(stats?.averageTimePerImageSeconds);
    const streak = stats ? stats.currentStreak ?? 0 : null;

    const value = (content, skeletonClass = "h-9 w-20") =>
      loading ? <Skeleton className={`${skeletonClass} mt-2`} /> : content;
    const figure = (label, content, caption) => (
      <div className="flex-1 p-6 sm:px-8">
        <p className="text-sm font-semibold text-muted">{label}</p>
        {value(<p className="mt-2 text-4xl leading-none font-extrabold text-ink tracking-[-0.03em] tabular-nums">{content}</p>)}
        <p className="mt-2 text-sm text-muted">{caption}</p>
      </div>
    );
    const unit = (text) => <span className="text-2xl font-bold text-subtle tracking-normal"> {text}</span>;
    const heading = "font-display text-2xl sm:text-3xl font-bold text-ink tracking-[-0.02em]";

    return (
      <section className="pb-20" data-dashboard-info>
        <Container className="space-y-12">
          {/* Recent sessions, in the page's own scroll: five, and five more at a time */}
          <section aria-labelledby="recent-title">
            <h2 id="recent-title" className={heading}>{COPY.recentTitle}</h2>
            <div className="mt-5 rounded-card border border-line bg-surface px-6 sm:px-8">
              {loading ? (
                <div className="flex flex-col gap-4 py-6">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : sessionsFailed ? (
                <p role="status" className="py-8 text-center text-sm text-muted">{COPY.loadFailed}</p>
              ) : recentSessions?.length > 0 ? (
                <>
                  <ul className="flex flex-col">
                    {recentSessions.map((session, index) => (
                      <RecentSessionItem sessionData={session} showAccess={showAccess} key={session.id || index} />
                    ))}
                  </ul>
                  {/* Five at a time: Show more adds the next five in place, Show
                      fewer goes back to the first (22 Oct 2026). Not endless
                      scrolling, which would keep pushing Your progress and the
                      footer away, and not numbered pages, heavy for a summary. */}
                  {(hasMoreSessions || canShowFewer || moreFailed) && (
                    <div className="-mx-6 sm:-mx-8 border-t border-line-card px-6 sm:px-8 py-1">
                      {moreFailed && <p role="status" className="pt-2 text-center text-sm text-muted">{COPY.moreFailed}</p>}
                      <div className="flex justify-center gap-4">
                        {hasMoreSessions && (
                          <span ref={this.moreButton}>
                            <Button variant="plain" size="sm" className="min-h-11" onClick={this.loadMoreSessions} disabled={loadingMore} aria-busy={loadingMore || undefined}>
                              {loadingMore ? COPY.loadingMore : COPY.showMore}
                            </Button>
                          </span>
                        )}
                        {canShowFewer && (
                          <Button variant="plain" size="sm" className="min-h-11" onClick={this.showFewerSessions}>
                            {COPY.showFewer}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="py-8 text-center text-sm text-muted">{COPY.noSessions}</p>
              )}
            </div>
          </section>
          {/* Your progress: the distance ladder and the three figures (chapter_5.tex) */}
          <section aria-labelledby="progress-title">
            <h2 id="progress-title" className={heading}>{COPY.progressTitle}</h2>
            <div className="mt-5 rounded-card border border-line bg-surface">
              <div className="p-6 sm:p-8">
                <p className="text-sm font-semibold text-muted">{COPY.distanceLabel}</p>
                {/* The UI face: the display face's old-style figures dip below the line */}
                {value(
                  <p className="mt-2 text-5xl sm:text-6xl leading-none font-extrabold text-ink tracking-[-0.035em] tabular-nums">
                    {totalKnown ? COPY.distanceValue(meters) : "–"}
                  </p>,
                  "h-14 w-40"
                )}
                {!loading && !totalKnown && <p role="status" className="mt-3 text-body">{COPY.loadFailed}</p>}
                {!loading && totalKnown && (
                  <>
                    <p className="mt-3 text-body">
                      {next ? COPY.distanceNext(next.meters - meters, next.place) : COPY.distanceDone}
                    </p>
                    <div className="mt-6">
                      <div className="mb-2 flex justify-between gap-4 text-sm font-semibold text-muted">
                        {/* "The Pasig River", not "the Pasig River", at the start of a label */}
                        <span>{previous ? labelStart(previous.place) : COPY.distanceStart}</span>
                        {next && <span className="text-right text-ink">{labelStart(next.place)}</span>}
                      </div>
                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-surface-subtle ring-1 ring-inset ring-line"
                        role="progressbar"
                        aria-valuenow={Math.round(progress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={next ? `Progress toward the length of ${next.place}` : COPY.distanceDone}
                      >
                        <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="border-t border-line divide-y divide-line sm:flex sm:divide-y-0 sm:divide-x">
                {/* Thousands separated, as the distance is: "1,284", not "1284" */}
                {figure(COPY.figures.total.label, totalKnown ? totalAnnotation.toLocaleString("en-PH") : "–", COPY.figures.total.unit(totalAnnotation))}
                {figure(COPY.figures.streak.label, streak == null ? "–" : <>{streak}{unit(COPY.figures.streak.unit(streak))}</>, COPY.figures.streak.caption)}
                {figure(COPY.figures.time.label, seconds == null ? "–" : <>{seconds}{unit(COPY.figures.time.unit)}</>, COPY.figures.time.caption)}
              </div>
            </div>
          </section>

        </Container>
      </section>
    );
  }
}
