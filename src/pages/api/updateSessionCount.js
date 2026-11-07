import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { capPosition, completedCount, sessionTotal } from "@/util/validators/sessionPosition";

/**
 * POST /api/updateSessionCount — records how far through a batch a contributor
 * has got.
 *
 * Storing the position on the server is what lets someone sign out partway
 * through, come back later or on another device, and resume on the same image
 * rather than starting the batch again.
 *
 * The position is capped (S20, 7 Nov 2026): never past the next unfinished
 * photo of the active session (validators/sessionPosition.js), so a
 * hand-made request cannot open the strip to photos never seen. A request
 * over the cap is clamped, not refused, so a page with an old cache keeps
 * working, and the stored value is returned as `currentCount`. With no
 * active session nothing is stored, as before.
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

        const filter = { userId: session.user._id, status: "active" };
        const active = await db.collection("sessions").findOne(filter, {
            projection: { imageIDs: 1, completedImageIDs: 1, totalCount: 1 },
        });
        if (!active) {
            return res.status(200).json({ message: "Session count updated.", currentCount: null });
        }

        const currentCount = capPosition(currentAnnotationCount, {
            total: sessionTotal(active),
            completedCount: completedCount(active),
        });
        await db.collection("sessions").updateOne(filter, { $set: { currentCount } });
        return res.status(200).json({ message: "Session count updated.", currentCount });
    } catch (e) {
        console.error("Failed to update session count:", e);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export default handler;
