import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";

const handler = async (req, res) => {
    if (req.method === "POST") {
        const session = await getServerSession(req, res, authOptions);

        if (!session) {
            return res.status(401).json({ message: "Unauthorized: Please log in." });
        }

        const { db } = await connectToDatabase();
        const username = session.user.username;
        const { total } = req.body;
        const date = new Date();

        try {
            const previousTotal = await db
                .collection("annotations")
                .countDocuments({ username: username, status: "completed" });

            await db.collection("sessions").updateOne(
                { username: username, status: "active" },
                { $set: { status: "completed", completedAt: date } }
            );

            await db.collection("annotations").updateMany(
                { username: username, status: "pending" },
                { $set: { status: "completed" } }
            );

            const newTotal = await db
                .collection("annotations")
                .countDocuments({ username: username, status: "completed" });

            const sessionDelta = newTotal - previousTotal;

            await db.collection("users").updateOne(
                { username: username },
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
