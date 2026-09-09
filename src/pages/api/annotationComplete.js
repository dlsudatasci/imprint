import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { ObjectId } from "mongodb";

/**
 * POST /api/annotationComplete — called when a contributor finishes a full
 * batch.
 *
 * Annotations are saved one image at a time as "pending" and only become
 * "completed" here, so an interrupted session never inflates anyone's count.
 * Stopping early goes through /api/annotationAbandon instead, which counts only
 * the images actually finished.
 *
 * The new total is recounted from the database rather than taken from the
 * request. The count stored on the user record is a cached copy of that number,
 * kept because the dashboard reads it on every page load.
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
            // Snapshot before and after the promotion. Counting the difference
            // rather than the pending rows keeps this correct when someone
            // re-annotates an image they'd already finished in an earlier
            // session: that row goes back to "pending" but was already counted,
            // so it contributes 0 to the delta instead of double-counting.
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

            // `total` is only ever echoed back into the activity string, but it
            // comes from the request body, so clamp it to a plain number rather
            // than writing arbitrary client text into the feed.
            const reportedTotal = Number.isFinite(Number(total))
                ? Math.max(0, Math.trunc(Number(total)))
                : sessionDelta;

            // The session was just marked completed — look it up by the
            // timestamp we wrote so we can find which images were in it.
            const completedSession = await db.collection("sessions").findOne({
                userId: userId,
                status: "completed",
                completedAt: date,
            });

            // For reference images: append the contributor's judgments to the
            // Image record so inter-rater agreement can be computed later.
            const sessionImageIDs = completedSession?.imageIDs || [];
            if (sessionImageIDs.length > 0) {
                const refImages = await db
                    .collection("Image")
                    .find(
                        { _id: { $in: sessionImageIDs }, isReference: true },
                        { projection: { _id: 1, imageID: 1 } }
                    )
                    .toArray();

                if (refImages.length > 0) {
                    const refImageIDs = refImages.map((img) => img.imageID);
                    const refAnnotations = await db
                        .collection("annotations")
                        .find({ userId, imageID: { $in: refImageIDs } })
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
                                        submittedAt: date,
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

            await db.collection("users").updateOne(
                { _id: new ObjectId(userId) },
                {
                    $inc: { totalAnnotations: sessionDelta },
                    $push: {
                        activities: {
                            $each: [{
                                activity: `You finished ${reportedTotal} annotations`,
                                date: date,
                                tag: "Annotation Session Done",
                            }],
                            $slice: -100,
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
