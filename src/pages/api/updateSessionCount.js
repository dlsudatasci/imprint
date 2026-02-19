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

        const { currentAnnotationCount } = req.body;

        if (!currentAnnotationCount) {
            return res.status(400).json({ message: "Missing currentAnnotationCount." });
        }

        try {
            await db.collection("sessions").updateOne(
                { username: username, status: "active" },
                { $set: { currentCount: currentAnnotationCount } }
            );
            return res.status(200).json({ message: "Session count updated." });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ message: "Internal Server Error" });
        }
    }
};

export default handler;
