import React from "react";
import ActivityItem from "./activityItem";
import { Activity, Target, Zap, Flame, Footprints, Lightbulb } from 'lucide-react';
import { MILESTONES, KILOMETERS_PER_ANNOTATION } from "@/util/milestones";

export default class DashboardInfo extends React.Component {
  state = {
    userActivity: [],
    totalAnnotation: 0,
    username: this.props.username,
    telemetryStats: null,
  };

  componentDidMount() {
    this.fetchData();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.refreshCounter !== this.props.refreshCounter || prevProps.username !== this.props.username) {
      this.setState({ username: this.props.username }, () => {
        this.fetchData();
      });
    }
  }

  async fetchData() {
    if (!this.state.username) return;

    try {
      const [extractUserRes, telemetryRes] = await Promise.all([
        fetch("/api/extractUser", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.state.username),
        }),
        fetch(`/api/telemetryStats?username=${this.state.username}`)
      ]);

      const extractUser = await extractUserRes.json();
      const telemetryStats = await telemetryRes.json();

      this.setState({
        userActivity: extractUser.userActivities,
        totalAnnotation: extractUser.annotationCount,
        telemetryStats: telemetryStats
      });
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    }
  }

  render() {
    const { totalAnnotation, userActivity, telemetryStats } = this.state;

    // Safely default if telemetry is still loading
    const stats = telemetryStats || {
      averageTimePerImageSeconds: "0.00",
      currentStreak: 0
    };

    const rawKmMapped = totalAnnotation * KILOMETERS_PER_ANNOTATION;
    const kmMapped = rawKmMapped.toFixed(2);

    const currentMilestone = MILESTONES.find(m => m.km > rawKmMapped) || { name: "the next major highway", km: rawKmMapped + 20 };

    const kmLeft = (currentMilestone.km - rawKmMapped).toFixed(2);
    const milestoneProgress = Math.min((rawKmMapped / currentMilestone.km) * 100, 100);

    return (
      <section className="pb-12 min-h-[60vh] pt-4">
        <div className="container mx-auto px-5 lg:max-w-7xl lg:w-4/5">

          {/* Fun Fact Pill (Now closer to the cards) */}
          {this.props.randomFact && (
            <div className="flex justify-center w-full mb-8">
              <div className="flex items-center gap-3 bg-amber-50/90 border border-amber-100 rounded-full py-2.5 px-6 text-[15px] font-medium text-amber-900 shadow-[0_2px_10px_rgb(0,0,0,0.02)] text-center leading-relaxed">
                <Lightbulb className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span>{this.props.randomFact}</span>
              </div>
            </div>
          )}

          {/* ROW 1: The "Hype" Stats Display */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12 w-full">

            {/* Card 1: Total Annotations */}
            <div className="bg-white/60 hover:bg-white backdrop-blur-md transition-colors duration-300 rounded-3xl border-2 border-white p-6 flex flex-col shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg text-gray-700 font-bold capitalize break-words">Total Contributions</h3>
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex justify-center items-center shadow-inner flex-shrink-0">
                  <Target className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-auto">
                <p className="text-[40px] leading-none font-black text-gray-900 truncate tracking-tight">{totalAnnotation}</p>
                <p className="text-sm text-gray-500 mt-2 font-semibold truncate">bounding boxes</p>
              </div>
            </div>

            {/* Card 2: Login Streak */}
            <div className="bg-white/60 hover:bg-white backdrop-blur-md transition-colors duration-300 rounded-3xl border-2 border-white p-6 flex flex-col shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg text-gray-700 font-bold capitalize break-words">Active Streak</h3>
                <div className="w-10 h-10 bg-orange-50 text-orange-500 rounded-2xl flex justify-center items-center shadow-inner flex-shrink-0">
                  <Flame className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-auto">
                <p className="text-[40px] leading-none font-black text-gray-900 truncate tracking-tight">{stats.currentStreak} <span className="text-2xl font-bold text-gray-400">days</span></p>
                <p className="text-sm text-gray-500 mt-2 font-semibold truncate">keep the fire going!</p>
              </div>
            </div>

            {/* Card 3: Speed */}
            <div className="bg-white/60 hover:bg-white backdrop-blur-md transition-colors duration-300 rounded-3xl border-2 border-white p-6 flex flex-col shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg text-gray-700 font-bold capitalize break-words">Image Speed</h3>
                <div className="w-10 h-10 bg-amber-50 text-amber-500 rounded-2xl flex justify-center items-center shadow-inner flex-shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-auto">
                <p className="text-[40px] leading-none font-black text-gray-900 truncate tracking-tight">{stats.averageTimePerImageSeconds}<span className="text-2xl font-bold text-gray-400"> s</span></p>
                <p className="text-sm text-gray-500 mt-2 font-semibold truncate">average per image</p>
              </div>
            </div>
          </div>

          {/* ROW 2: Real-World Impact Banner */}
          <div className="bg-gradient-to-r from-[#004aad] to-indigo-500 rounded-3xl p-8 mb-12 relative overflow-hidden text-white shadow-md">
            <Footprints className="absolute -right-4 -bottom-4 w-32 h-32 text-white/10 transform -rotate-12 pointer-events-none" />

            <div className="relative z-10 w-full">
              <h2 className="text-3xl lg:text-4xl font-black mb-2 tracking-tight">You&apos;ve helped map <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-400">{kmMapped}km</span> of safe sidewalks!</h2>
              <p className="text-white/90 text-sm mb-6 font-medium bg-white/10 inline-block px-3 py-1 rounded-full border border-white/20">
                Only <strong className="text-yellow-300 font-bold">{kmLeft}km</strong> left to map the equivalent of {currentMilestone.name}!
              </p>

              {/* Milestone Progress Bar */}
              <div className="w-full">
                <div className="flex justify-between text-sm font-bold text-blue-100 mb-3 tracking-wide">
                  <span>START</span>
                  <span>{currentMilestone.km}km Goal</span>
                </div>
                <div className="w-full h-4 bg-black/20 rounded-full overflow-hidden shadow-inner backdrop-blur-sm">
                  <div
                    className="h-full bg-gradient-to-r from-orange-400 to-pink-600 rounded-full transition-all duration-1000 ease-out relative"
                    style={{ width: `${milestoneProgress}%` }}
                  >
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ROW 3: Recent Activity */}
          <div className="bg-white/60 backdrop-blur-md rounded-3xl border border-gray-100 p-8 flex flex-col shadow-sm max-h-[400px]">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-pink-50 text-pink-600 rounded-2xl">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 tracking-tight">Recent Activity</h3>
            </div>

            <ul className="flex-1 overflow-y-auto pr-2 space-y-3">
              {userActivity.length > 0 ? (
                userActivity
                  .slice()
                  .reverse()
                  .map((activity, index) => (
                    <ActivityItem activity={activity} key={index} />
                  ))
              ) : (
                <p className="text-[13px] text-gray-400 text-center mt-10">No recent activity found.</p>
              )}
            </ul>
          </div>

        </div>
      </section>
    );
  }
}