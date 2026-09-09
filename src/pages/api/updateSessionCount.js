import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

/**
 * POST /api/updateSessionCount — records how far through a batch a contributor
 * has got.
 *
 * Storing the position on the server is what lets someone sign out partway
 * through, come back later or on another device, and resume on the same image
 * rather than starting the batch again.
 */
const handler = async (req, res) => {
    if (req.method !== "POST") {
        res.setHeader("Allow", ["POST"]);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    const session = await getServerSession(req, res, authOptions);

    if (!session || !session.user?._id) {
        return res.status(401).json({ message: "Unauthorized: Please log in." });
    }

    const currentAnnotationCount = Number(req.body?.currentAnnotationCount);

    // Check the parsed number rather than whether it is truthy: a plain
    // falsy check would also reject a legitimate 0
    if (!Number.isInteger(currentAnnotationCount) || currentAnnotationCount < 0) {
        return res.status(400).json({ message: "currentAnnotationCount must be a non-negative integer." });
    }

    try {
        const { db } = await connectToDatabase();

        await db.collection("sessions").updateOne(
            { userId: session.user._id, status: "active" },
            { $set: { currentCount: currentAnnotationCount } }
        );
        return res.status(200).json({ message: "Session count updated." });
    } catch (e) {
        console.error("Failed to update session count:", e);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export default handler;
