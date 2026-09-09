import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

/**
 * GET /api/telemetryStats — the two calculated figures on the dashboard:
 *
 *   averageTimePerImageSeconds  how long a contributor takes per image
 *   currentStreak               consecutive days with at least one submission
 *
 * Both are worked out from the telemetry log each time rather than stored, so
 * there is no running counter that can drift out of step with reality.
 *
 * Days are counted in Philippine time, not UTC. Contributors are in the
 * Philippines, and under UTC an evening session would be recorded as the next
 * day and break a streak the contributor experienced as unbroken.
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

        // Walk backwards from the most recent active day, counting while the
        // dates stay consecutive. The aggregation already sorted them newest
        // first and collapsed duplicates, so this is a single pass.
        let currentStreak = 0;
        if (uniqueDatesCursor.length > 0) {
            // Shifting by +8h and reading the UTC date gives the Manila
            // calendar day, matching how $dateToString bucketed the rows above
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

            // Yesterday still counts: someone who hasn't annotated *yet* today
            // hasn't lost their streak, they just haven't extended it. Anything
            // older means the chain is already broken, so the streak is 0.
            if (mostRecentString === todayString || mostRecentString === yesterdayString) {
                // Parsed as UTC midnight deliberately — these are calendar-day
                // labels being stepped through, not real instants, so local
                // timezone must not enter into it
                let checkDate = new Date(mostRecentString + "T00:00:00Z");

                for (const row of uniqueDatesCursor) {
                    const expectedString = checkDate.toISOString().split("T")[0];

                    if (row._id === expectedString) {
                        currentStreak++;
                        checkDate.setUTCDate(checkDate.getUTCDate() - 1);
                    } else {
                        // First gap ends the streak — everything older is a
                        // separate run and doesn't count toward the current one
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
