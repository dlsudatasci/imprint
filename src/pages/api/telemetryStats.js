import { connectToDatabase } from "@/util/mongodb";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", ["GET"]);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    const { username } = req.query;

    try {
        const { db } = await connectToDatabase();

        // Match stage for specific user if provided
        const matchUser = username ? { username } : {};

        // 1. Average annotation duration (average time spent per session)
        // We calculate this from the `sessions` collection since it has exact start and end times
        const sessionDurations = await db.collection("sessions").aggregate([
            { $match: { ...matchUser, status: { $in: ["completed", "abandoned"] } } },
            {
                $project: {
                    durationMs: {
                        $subtract: [
                            { $ifNull: ["$completedAt", "$abandonedAt"] },
                            "$createdAt",
                        ],
                    },
                },
            },
            {
                $group: {
                    _id: null,
                    avgDurationMs: { $avg: "$durationMs" },
                },
            },
        ]).toArray();

        const avgSessionDurationMs = sessionDurations.length > 0 ? sessionDurations[0].avgDurationMs : 0;

        // 2. Success retention rate (completion vs cancel)
        const sessionOutcomes = await db.collection("telemetry_logs").aggregate([
            { $match: { ...matchUser, event: "SESSION_END" } },
            {
                $group: {
                    _id: "$outcome",
                    count: { $sum: 1 }
                }
            }
        ]).toArray();

        let completedSessions = 0;
        let abandonedSessions = 0;
        sessionOutcomes.forEach(outcome => {
            if (outcome._id === "completed") completedSessions = outcome.count;
            if (outcome._id === "abandoned") abandonedSessions = outcome.count;
        });
        const totalEndedSessions = completedSessions + abandonedSessions;
        const successRetentionRate = totalEndedSessions > 0 ? (completedSessions / totalEndedSessions) * 100 : 0;

        // 3. Most frequently chosen session size (5, 10, 20, 40)
        const sessionSizes = await db.collection("telemetry_logs").aggregate([
            { $match: { ...matchUser, event: "SESSION_START" } },
            {
                $group: {
                    _id: "$sessionTotalCount",
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 1 }
        ]).toArray();

        const mostFrequentSessionSize = sessionSizes.length > 0 ? sessionSizes[0]._id : null;

        // 4. Image/Bounding Box Metrics
        const imageMetrics = await db.collection("telemetry_logs").aggregate([
            { $match: { ...matchUser, event: "IMAGE_SUBMITTED" } },
            {
                $group: {
                    _id: null,
                    avgImageDurationMs: { $avg: "$imageDurationMs" },
                    totalAccepted: { $sum: "$acceptedSuggestionCount" },
                    totalModified: { $sum: "$modifiedSuggestionCount" },
                    totalDeleted: { $sum: "$deletedSuggestionCount" },
                    totalManual: { $sum: "$manualBoxCount" }
                }
            }
        ]).toArray();

        let avgTimePerImageMs = 0;
        let percentAccepted = 0;
        let percentModified = 0;
        let percentDeleted = 0;

        if (imageMetrics.length > 0) {
            const metrics = imageMetrics[0];
            avgTimePerImageMs = metrics.avgImageDurationMs;

            const totalSuggestions = metrics.totalAccepted + metrics.totalModified + metrics.totalDeleted;
            if (totalSuggestions > 0) {
                percentAccepted = (metrics.totalAccepted / totalSuggestions) * 100;
                percentModified = (metrics.totalModified / totalSuggestions) * 100;
                percentDeleted = (metrics.totalDeleted / totalSuggestions) * 100;
            }
        }

        // 5. Calculate Login/Active Streak
        // Find all unique dates (YYYY-MM-DD) where the user submitted an image
        const uniqueDatesCursor = await db.collection("telemetry_logs").aggregate([
            { $match: { ...matchUser, event: "IMAGE_SUBMITTED" } },
            {
                $project: {
                    dateString: {
                        $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: "Asia/Manila" }
                    }
                }
            },
            {
                $group: {
                    _id: "$dateString"
                }
            },
            { $sort: { _id: -1 } } // Sort newest to oldest
        ]).toArray();

        // Calculate consecutive streak
        let currentStreak = 0;
        if (uniqueDatesCursor.length > 0) {
            const today = new Date();
            // Convert 'today' to Manila timezone string to perfectly match DB aggregation
            const todayString = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(today); // YYYY-MM-DD

            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayString = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(yesterday);

            let checkDate = new Date(todayString);

            // The streak can start either today or yesterday (if they haven't logged in yet today)
            // If the most recent log isn't today OR yesterday, their streak is broken (0).
            const mostRecentString = uniqueDatesCursor[0]._id;

            if (mostRecentString === todayString || mostRecentString === yesterdayString) {
                // If it starts yesterday, step our checking date back by one
                if (mostRecentString === yesterdayString) {
                    checkDate.setDate(checkDate.getDate() - 1);
                }

                // Track backwards day by day to see how long the unbroken chain is
                for (const row of uniqueDatesCursor) {
                    const rowDateString = row._id;
                    const expectedString = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(checkDate); // use UTC format parsing to match YYYY-MM-DD exactly

                    if (rowDateString === expectedString) {
                        currentStreak++;
                        checkDate.setDate(checkDate.getDate() - 1); // step back one day
                    } else {
                        break; // streak broken
                    }
                }
            }
        }

        // Format final response
        const stats = {
            username: username || "ALL_USERS",
            averageAnnotationDurationSeconds: (avgSessionDurationMs / 1000).toFixed(2),
            averageTimePerImageSeconds: (avgTimePerImageMs / 1000).toFixed(2),
            mostFrequentSessionSize: mostFrequentSessionSize,
            successRetentionRatePercent: successRetentionRate.toFixed(2) + "%",
            suggestionAcceptancePercent: percentAccepted.toFixed(2) + "%",
            suggestionModifiedPercent: percentModified.toFixed(2) + "%",
            suggestionDeletedPercent: percentDeleted.toFixed(2) + "%",
            currentStreak: currentStreak,
        };

        return res.status(200).json(stats);
    } catch (error) {
        console.error("Failed to fetch telemetry stats:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
