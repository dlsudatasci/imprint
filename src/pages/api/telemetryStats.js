import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

/**
 * GET /api/telemetryStats
 * 
 * Retrieves user-specific telemetry statistics for the dashboard.
 * Currently returns:
 * - averageTimePerImageSeconds: Average time spent per image annotation.
 * - currentStreak: Consecutive days of activity based on IMAGE_SUBMITTED events.
 */

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", ["GET"]);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    const session = await getServerSession(req, res, authOptions);
    if (!session || !session.user?._id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = session.user._id;

    try {
        const { db } = await connectToDatabase();

        const matchUser = { userId };

        // Average time per image (the only image metric the dashboard uses)
        const imageMetrics = await db.collection("telemetry_logs").aggregate([
            { $match: { ...matchUser, event: "IMAGE_SUBMITTED" } },
            {
                $group: {
                    _id: null,
                    avgImageDurationMs: { $avg: "$imageDurationMs" },
                }
            }
        ]).toArray();

        const avgTimePerImageMs = imageMetrics.length > 0 ? imageMetrics[0].avgImageDurationMs : 0;

        // Active streak — consecutive days with at least one IMAGE_SUBMITTED event
        const uniqueDatesCursor = await db.collection("telemetry_logs").aggregate([
            { $match: { ...matchUser, event: "IMAGE_SUBMITTED" } },
            {
                $project: {
                    dateString: {
                        $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: "Asia/Manila" }
                    }
                }
            },
            { $group: { _id: "$dateString" } },
            { $sort: { _id: -1 } }
        ]).toArray();

        // Calculate consecutive active days (streak)
        let currentStreak = 0;
        if (uniqueDatesCursor.length > 0) {
            // Helper to get YYYY-MM-DD string adjusted to Manila time (+8)
            const getManilaDateString = (dateObj) => {
                const manilaDate = new Date(dateObj.getTime() + 8 * 60 * 60 * 1000);
                return manilaDate.toISOString().split("T")[0];
            };

            const today = new Date();
            const todayString = getManilaDateString(today);

            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayString = getManilaDateString(yesterday);

            const mostRecentString = uniqueDatesCursor[0]._id;

            // A streak is only active if the latest activity was today or yesterday
            if (mostRecentString === todayString || mostRecentString === yesterdayString) {
                // Initialize check date to the most recent activity date at midnight UTC
                let checkDate = new Date(mostRecentString + "T00:00:00Z");

                for (const row of uniqueDatesCursor) {
                    const expectedString = checkDate.toISOString().split("T")[0];

                    if (row._id === expectedString) {
                        currentStreak++;
                        checkDate.setUTCDate(checkDate.getUTCDate() - 1);
                    } else {
                        // Break the streak if the sequence skips a day
                        break;
                    }
                }
            }
        }

        return res.status(200).json({
            averageTimePerImageSeconds: (avgTimePerImageMs / 1000).toFixed(2),
            currentStreak: currentStreak,
        });
    } catch (error) {
        console.error("Failed to fetch telemetry stats:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
