import React from "react";
import RecentSessionItem from "./recentSessionItem";
import { Skeleton, Container } from "@/ui";
import { MILESTONES, KILOMETERS_PER_ANNOTATION } from "@/util/milestones";

/**
 * The lower half of the contributor dashboard: session history, the
 * distance-mapped banner, and personal contribution figures.
 *
 * Calls three endpoints in parallel rather than one combined route. They cost
 * very different amounts to compute, and a slow telemetry aggregation shouldn't
 * hold up the session list.
 */
export default class DashboardInfo extends React.Component {
  state = {
    recentSessions: [],
    totalAnnotation: 0,
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

      const extractUser = await extractUserRes.json();
      const telemetryStats = await telemetryRes.json();
      const recentSessionsData = await recentSessionsRes.json();

      this.setState({
        recentSessions: recentSessionsData.sessions || [],
        totalAnnotation: extractUser.annotationCount,
        telemetryStats: telemetryStats,
        loading: false,
      });
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
      this.setState({ loading: false });
    }
  }

  render() {
    const { totalAnnotation, recentSessions, telemetryStats, loading } = this.state;

    // Deliberately no zeroed fallback. A `0` that becomes `47` a moment later
    // reads as a real answer, so an unloaded stat renders as a skeleton and the
    // banner is withheld entirely until there's a true distance to report.
    const stats = telemetryStats;

    const rawKmMapped = totalAnnotation * KILOMETERS_PER_ANNOTATION;
    const kmMapped = rawKmMapped.toFixed(2);

    // First milestone still ahead of them — MILESTONES is sorted ascending, so
    // find() gives the nearest one. Past the end of the list the fallback keeps
    // a target 20km out rather than showing a finished bar with nothing next.
    const currentMilestone = MILESTONES.find(m => m.km > rawKmMapped) || { name: "the next major highway", km: rawKmMapped + 20 };

    const kmLeft = (currentMilestone.km - rawKmMapped).toFixed(2);
    const milestoneProgress = Math.min((rawKmMapped / currentMilestone.km) * 100, 100);

    const figure = (label, value, caption) => (
      <div className="flex-1 p-6">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">{label}</p>
        {loading ? (
          <Skeleton className="h-9 w-20 mt-3 mb-2" />
        ) : (
          <p className="text-4xl leading-none font-extrabold text-ink tracking-tight mt-2">{value}</p>
        )}
        <p className="text-sm text-muted mt-2 font-medium">{caption}</p>
      </div>
    );

    return (
      <section className="pb-12 min-h-[60vh] pt-2">
        <Container>
          <hr className="border-line border-t-2 mb-8" />

          {/* ROW 1: Recent Sessions */}
          <div className="mb-12">
            <h3 className="text-2xl font-semibold text-ink tracking-tight mb-6 px-2">Recent Sessions</h3>

            <div className="bg-surface rounded-card border border-line px-8 py-4">
              <div className="flex-1 overflow-y-auto max-h-[380px] pr-2">
                {loading ? (
                  <div className="flex flex-col gap-4 py-4">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : (
                  <ul className="flex flex-col">
                    {recentSessions?.length > 0 ? (
                      recentSessions.map((session, index) => (
                        <RecentSessionItem sessionData={session} key={session.id || index} />
                      ))
                    ) : (
                      <p className="text-[13px] text-subtle text-center mt-6">No recent sessions found.</p>
                    )}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Real-World Impact Banner */}
          <div className="bg-primary rounded-card p-8 mb-12 text-white">
            {loading ? (
              <div className="flex flex-col gap-4">
                <Skeleton className="h-9 w-2/3 bg-white/20" />
                <Skeleton className="h-4 w-full bg-white/20" />
              </div>
            ) : (
              <div className="w-full">
                <h2 className="text-3xl lg:text-4xl font-extrabold mb-2 tracking-tight">
                  You&apos;ve helped map {kmMapped}km of safe sidewalks.
                </h2>
                <p className="text-white/90 text-sm mb-6 font-medium">
                  Only <strong className="font-bold">{kmLeft}km</strong> left to match the length of {currentMilestone.name}.
                </p>

                {/* Milestone Progress Bar */}
                <div className="w-full">
                  <div className="flex justify-between text-sm font-semibold text-white/80 mb-3 tracking-wide">
                    <span>START</span>
                    <span>{currentMilestone.km}km goal</span>
                  </div>
                  <div
                    className="w-full h-3 bg-white/20 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={Math.round(milestoneProgress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Progress toward ${currentMilestone.name}`}
                  >
                    <div
                      className="h-full bg-white rounded-full transition-[width] duration-1000 ease-out"
                      style={{ width: `${milestoneProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
              </div>

          {/* Contribution figures — one bordered row rather than a card each, so
              the numbers read as a set instead of three competing panels */}
          <div className="bg-surface border border-line rounded-card divide-y divide-line sm:flex sm:divide-y-0 sm:divide-x mb-12 w-full">
            {figure(
              "Total contributions",
              totalAnnotation,
              `${totalAnnotation === 1 ? 'obstruction' : 'obstructions'} annotated`,
            )}
            {figure(
              "Active streak",
              <>
                {stats?.currentStreak ?? 0}
                <span className="text-2xl font-bold text-subtle"> {stats?.currentStreak === 1 ? 'day' : 'days'}</span>
              </>,
              "consecutive days contributing",
            )}
            {figure(
              "Image speed",
              <>
                {stats?.averageTimePerImageSeconds ?? "0.00"}
                <span className="text-2xl font-bold text-subtle"> s</span>
              </>,
              "average per image",
            )}
          </div>

        </Container>
      </section>
    );
  }
}
