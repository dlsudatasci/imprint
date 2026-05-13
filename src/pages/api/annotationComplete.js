import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { ObjectId } from "mongodb";

/**
 * POST /api/annotationComplete
 * 
 * Finalizes an active session.
 * Marks the session as "completed", transitions all "pending" annotations to "completed",
 * updates the user's total annotations count, and appends a success activity log.
 */
const handler = async (req, res) => {
    if (req.method === "POST") {
        const session = await getServerSession(req, res, authOptions);

        if (!session || !session.user?._id) {
            return res.status(401).json({ message: "Unauthorized: Please log in." });
        }

        const { db } = await connectToDatabase();
        const userId = session.user._id;
        const username = session.user.username;
        const { total } = req.body;
        const date = new Date();

        try {
            const previousTotal = await db
                .collection("annotations")
                .countDocuments({ userId: userId, status: "completed" });

            await db.collection("sessions").updateOne(
                { userId: userId, status: "active" },
                { $set: { status: "completed", completedAt: date } }
            );

            await db.collection("annotations").updateMany(
                { userId: userId, status: "pending" },
                { $set: { status: "completed" } }
            );

            const newTotal = await db
                .collection("annotations")
                .countDocuments({ userId: userId, status: "completed" });

            const sessionDelta = newTotal - previousTotal;

            await db.collection("users").updateOne(
                { _id: new ObjectId(userId) },
                {
                    $inc: { totalAnnotations: sessionDelta },
                    $push: {
                        activities: {
                            activity: `You finished ${total} annotations`,
                            date: date,
                            tag: "Annotation Session Done",
                        },
                    },
                }
            );

            await logTelemetryEvent({
                event: "SESSION_END",
                userId: userId,
                username: username,
                outcome: "completed",
                imagesCompleted: total,
            });

            return res.status(200).json({
                message: "Session and annotations finalized successfully.",
                previousTotal: previousTotal,
                newTotal: newTotal
            });

        } catch (error) {
            console.error("Database Error:", error);
            return res.status(500).json({ message: "Internal Server Error" });
        }
    } else {
        res.setHeader("Allow", ["POST"]);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }
};

export default handler;
