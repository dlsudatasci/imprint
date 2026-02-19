import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

const handler = async (req, res) => {
    if (req.method === "POST") {
        const session = await getServerSession(req, res, authOptions);

        if (!session) {
            return res.status(401).json({ message: "Unauthorized: Please log in." });
        }

        const { db } = await connectToDatabase();
        const username = session.user.username;

        try {
            // Find the active session before abandoning
            const activeSession = await db.collection("sessions").findOne({
                username: username,
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
                        { username: username, status: "pending", imageID: { $in: completedImages } },
                        { $set: { status: "completed" } }
                    );

                    // Log activity for the portion they finished
                    await db.collection("users").updateOne(
                        { username: username },
                        {
                            $push: {
                                activities: {
                                    activity: `Abandoned session but finished ${completedCount} annotations`,
                                    date: new Date(),
                                    tag: "Session Abandoned",
                                },
                            },
                        }
                    );
                }

                // Clean up any other pending annotations that weren't completed
                await db.collection("annotations").deleteMany({
                    username: username,
                    status: "pending",
                });

                console.log(`Session abandoned for user: ${username}. Saved ${completedCount} annotations.`);
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
