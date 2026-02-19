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
        const { total } = req.body;
        const date = new Date();

        try {
            // 1. Mark the active session as completed
            await db.collection("sessions").updateOne(
                { username: username, status: "active" },
                { $set: { status: "completed", completedAt: date } }
            );

            // 2. Mark all pending annotations for this user as completed
            await db.collection("annotations").updateMany(
                { username: username, status: "pending" },
                { $set: { status: "completed" } }
            );

            // 3. Log the "Finished" activity
            await db.collection("users").updateOne(
                { username: username },
                {
                    $push: {
                        activities: {
                            activity: `You finished ${total} annotations`,
                            date: date,
                            tag: "Annotation Session Done",
                        },
                    },
                }
            );

            console.log(`User ${username} successfully completed a session of ${total} annotations.`);
            return res.status(200).json({ message: "Session and annotations finalized successfully." });

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
