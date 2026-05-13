import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { ObjectId } from "mongodb";

/**
 * POST /api/annotationAbandon
 * 
 * Handles the premature termination of an active session.
 * Finalizes any completed annotations, discards pending/skipped images,
 * and increments the user's overall count only for the images they actually finished.
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

        try {
            // Find the active session before abandoning
            const activeSession = await db.collection("sessions").findOne({
                userId: userId,
                status: "active",
            });

            if (activeSession) {
                // Mark session as abandoned
                await db.collection("sessions").updateOne(
                    { _id: activeSession._id },
                    { $set: { status: "abandoned", abandonedAt: new Date() } }
                );

                const completedImages = activeSession.completedImageIDs || [];
                const completedCount = completedImages.length;

                if (completedCount > 0) {
                    // Finalize the ones they actually finished
                    await db.collection("annotations").updateMany(
                        { userId: userId, status: "pending", imageID: { $in: completedImages } },
                        { $set: { status: "completed" } }
                    );

                    // Log activity and increment the denormalized counter for the portion they finished
                    await db.collection("users").updateOne(
                        { _id: new ObjectId(userId) },
                        {
                            $inc: { totalAnnotations: completedCount },
                            $push: {
                                activities: {
                                    activity: `Abandoned session (${completedCount} annotation${completedCount === 1 ? '' : 's'} finished)`,
                                    date: new Date(),
                                    tag: "Session Abandoned",
                                },
                            },
                        }
                    );
                }

                // Clean up any other pending annotations that weren't completed
                await db.collection("annotations").deleteMany({
                    userId: userId,
                    status: "pending",
                });

                await logTelemetryEvent({
                    event: "SESSION_END",
                    userId: userId,
                    username: username,
                    outcome: "abandoned",
                    imagesCompleted: completedCount,
                });

                return res.status(200).json({ message: "Session abandoned successfully." });
            } else {
                return res.status(404).json({ message: "No active session found to abandon." });
            }
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
