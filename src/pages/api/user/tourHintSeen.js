import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { ObjectId } from "mongodb";

/**
 * POST /api/user/tourHintSeen — records that a contributor has seen the
 * one-time line saying where the tour is (S30, 14 Nov 2026).
 *
 * The line shows on the first photo of a contributor's first real session
 * after the tour moved into sessions. annotationGet sends `showTourHint`
 * while `users.tourHintSeenAt` is missing, and the annotate page calls this
 * as the line shows, so another device does not show it again. The date is
 * set only when it is missing.
 *
 * Signed-in contributors only. Takes no body.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?._id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { db } = await connectToDatabase();
    const users = db.collection("users");
    const _id = new ObjectId(session.user._id);
    const user = await users.findOne({ _id }, { projection: { role: 1 } });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "annotator") return res.status(403).json({ message: "Contributors only" });

    await users.updateOne(
      { _id, tourHintSeenAt: { $exists: false } },
      { $set: { tourHintSeenAt: new Date() } }
    );
    return res.status(200).json({ message: "Saved" });
  } catch (error) {
    console.error("Error saving tourHintSeen:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
