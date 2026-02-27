import React from "react";
import { H3 } from "@/ui/Typography";
import { P } from "@/ui/Typography";
import Tooltip from "ui/tooltip";
import ActivityItem from "./activityItem";
import { Activity, Target, Zap, Flame, Footprints, Lightbulb } from 'lucide-react';

export default class DashboardInfo extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      userActivity: [],
      totalAnnotation: 0,
      username: this.props.username,
      telemetryStats: null,
    };
  }

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

    // Math for Real-World Impact
    const kmMapped = (totalAnnotation * 0.002).toFixed(2);

    // Actual Philippine Landmark Milestones
    const MILESTONES = [
      { name: "the length of the San Juanico Bridge", km: 2.16 },
      { name: "the length of Roxas Boulevard", km: 7.6 },
      { name: "the entire length of EDSA", km: 23.8 },
      { name: "the length of C-5 Road", km: 32.5 },
      { name: "the distance from Manila to Tagaytay", km: 65.0 },
      { name: "the length of SCTEX", km: 93.7 },
      { name: "the distance from Manila to Baguio", km: 246.0 },
      { name: "the entire length of Palawan Island", km: 450.0 },
      { name: "the length of the Maharlika Highway", km: 3379.73 } // The ultimate boss
    ];

    // Find the first milestone they haven't reached yet
    const currentMilestone = MILESTONES.find(m => m.km > parseFloat(kmMapped)) || { name: "the next major highway", km: parseFloat(kmMapped) + 20 };

    const kmLeft = (currentMilestone.km - kmMapped).toFixed(2);
    const milestoneProgress = Math.min((parseFloat(kmMapped) / currentMilestone.km) * 100, 100);

    return (
      <section className="pb-12 min-h-[60vh] pt-10">
        <div className="container mx-auto px-5 lg:max-w-7xl lg:w-4/5">

          {/* ROW 1: The "Hype" Stats Display */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6 w-full">

            {/* Card 1: Total Annotations */}
            <div className="bg-white/50 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-5 flex flex-col shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[14px] text-gray-500 font-bold uppercase tracking-widest break-words">Contributions</h3>
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex justify-center items-center shadow-inner flex-shrink-0">
                  <Target className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-auto">
                <p className="text-[25px] font-extrabold text-gray-900 truncate">{totalAnnotation}</p>
                <p className="text-[11px] text-gray-400 mt-1 font-medium truncate">total bounding boxes</p>
              </div>
            </div>

            {/* Card 2: Login Streak */}
            <div className="bg-white/50 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-5 flex flex-col shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[14px] text-gray-500 font-bold uppercase tracking-widest break-words">Active Streak</h3>
                <div className="w-8 h-8 bg-orange-50 text-orange-500 rounded-lg flex justify-center items-center shadow-inner flex-shrink-0">
                  <Flame className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-auto">
                <p className="text-[25px] font-extrabold text-gray-900 truncate">{stats.currentStreak} Days</p>
                <p className="text-[11px] text-gray-400 mt-1 font-medium truncate">keep the fire going!</p>
              </div>
            </div>

            {/* Card 3: Speed */}
            <div className="bg-white/50 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-5 flex flex-col shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[14px] text-gray-500 font-bold uppercase tracking-widest break-words">Image Speed</h3>
                <div className="w-8 h-8 bg-amber-50 text-amber-500 rounded-lg flex justify-center items-center shadow-inner flex-shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-auto">
                <p className="text-[25px] font-extrabold text-gray-900 truncate">{stats.averageTimePerImageSeconds}s</p>
                <p className="text-[11px] text-gray-400 mt-1 font-medium truncate">average per image</p>
              </div>
            </div>
          </div>

          {/* ROW 2: Real-World Impact Banner */}
          <div className="bg-gradient-to-r from-indigo-600 to-blue-500 rounded-2xl p-6 shadow-md mb-6 text-white relative overflow-hidden">
            <Footprints className="absolute -right-4 -bottom-4 w-32 h-32 text-white/10 transform -rotate-12" />

            <div className="relative z-10">
              <h2 className="text-2xl font-black mb-1">You've helped map {kmMapped}km of safe sidewalks!</h2>
              <p className="text-blue-100 text-[15px] mb-5 font-medium">
                Only <strong className="text-white">{kmLeft}km</strong> left to map the equivalent of {currentMilestone.name}!
              </p>

              {/* Milestone Progress Bar */}
              <div className="w-full">
                <div className="flex justify-between text-[11px] font-bold text-blue-100 mb-2 uppercase tracking-wider">
                  <span>Start</span>
                  <span>{currentMilestone.km}km Goal</span>
                </div>
                <div className="w-full h-3 bg-black/20 rounded-full overflow-hidden backdrop-blur-sm">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-1000 ease-out relative"
                    style={{ width: `${milestoneProgress}%` }}
                  >
                    <div className="absolute right-0 top-0 bottom-0 w-4 bg-white/50 blur-sm"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ROW 3: Recent Activity */}
          <div className="bg-white/50 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-6 flex flex-col shadow-sm max-h-[400px]">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-pink-50 text-pink-600 rounded-lg">
                <Activity className="w-5 h-5" />
              </div>
              <h3 className="text-[18px] font-bold text-gray-800">Recent Activity</h3>
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