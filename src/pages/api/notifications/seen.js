import { ObjectId } from "mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { connectToDatabase } from "@/util/mongodb";

/**
 * POST /api/notifications/seen (S29, 16 Nov 2026): the signed-in user opened
 * the bell, so every message in their feed so far is read. Sets
 * `users.notificationsSeenAt` to now. The navbar clears the dot itself at
 * once and does not wait for this.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?._id || !ObjectId.isValid(session.user._id)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { db } = await connectToDatabase();
    await db.collection("users").updateOne(
      { _id: new ObjectId(session.user._id) },
      { $set: { notificationsSeenAt: new Date() } }
    );
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Failed to mark notifications as seen:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
