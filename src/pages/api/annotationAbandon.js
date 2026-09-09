import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { ObjectId } from "mongodb";

/**
 * POST /api/annotationAbandon — called when a contributor stops partway through
 * a batch.
 *
 * The rule is that submitted work counts and work in progress does not. Images
 * the session recorded as finished become "completed", and any remaining
 * pending records for that contributor are deleted. Those are half-finished
 * images from the batch just abandoned, and keeping them would put unreviewed
 * boxes into the dataset.
 *
 * Takes no request body. Which images were finished is server-side state, not
 * something the browser gets to claim.
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
                    const finalized = await db.collection("annotations").updateMany(
                        { userId: userId, status: "pending", imageID: { $in: completedImages } },
                        { $set: { status: "completed" } }
                    );

                    // Append completed reference-image judgments to the Image
                    // record, same as annotationComplete does for full sessions.
                    const refImages = await db
                        .collection("Image")
                        .find(
                            { _id: { $in: activeSession.imageIDs || [] }, isReference: true },
                            { projection: { _id: 1, imageID: 1 } }
                        )
                        .toArray();

                    if (refImages.length > 0) {
                        const refImageIDs = refImages.map((img) => img.imageID);
                        const completedRefIDs = refImageIDs.filter((id) => completedImages.includes(id));

                        if (completedRefIDs.length > 0) {
                            const refAnnotations = await db
                                .collection("annotations")
                                .find({ userId, imageID: { $in: completedRefIDs }, status: "completed" })
                                .toArray();

                            const ops = refAnnotations.map((ann) => ({
                                updateOne: {
                                    filter: { imageID: ann.imageID },
                                    update: {
                                        $push: {
                                            referenceGroundTruth: {
                                                userId,
                                                source: ann.source,
                                                sceneLevel: ann.sceneLevel,
                                                selectedObjectsID: ann.selectedObjectsID,
                                                newObjects: ann.newObjects,
                                                submittedAt: new Date(),
                                            },
                                        },
                                    },
                                },
                            }));

                            if (ops.length > 0) {
                                await db.collection("Image").bulkWrite(ops);
                            }
                        }
                    }

                    // Count only the rows this call actually flipped to completed.
                    // Using completedImages.length would double-count anything the
                    // user re-annotated, since re-submitting an image resets it to
                    // "pending" even though it was already tallied once.
                    const newlyCompleted = finalized.modifiedCount;

                    if (newlyCompleted > 0) {
                        await db.collection("users").updateOne(
                            { _id: new ObjectId(userId) },
                            {
                                $inc: { totalAnnotations: newlyCompleted },
                                $push: {
                                    activities: {
                                        $each: [{
                                            activity: `Abandoned session (${newlyCompleted} annotation${newlyCompleted === 1 ? '' : 's'} finished)`,
                                            date: new Date(),
                                            tag: "Session Abandoned",
                                        }],
                                        $slice: -100,
                                    },
                                },
                            }
                        );
                    }
                }

                // Whatever is still pending after the promotion above is work
                // from the image they were mid-way through. Drop it — partial
                // annotations aren't usable training data.
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
