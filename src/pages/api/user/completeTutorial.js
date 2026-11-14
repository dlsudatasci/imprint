import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { ObjectId } from "mongodb";
import { tutorialVersionFor } from "@/util/tutorialVersion";

/**
 * POST /api/user/completeTutorial — records that a contributor has finished the
 * walkthrough.
 *
 * The navbar and dashboard keep annotating locked until this is set, so it has
 * to be stored on the server. Keeping it only in the browser would make someone
 * repeat the tutorial on every new device.
 *
 * The first completion is also recorded once (S30, 14 Nov 2026), so the
 * analysis knows who did which tutorial: `tutorialCompletedAt`, its date, and
 * `tutorialVersion`, 2 for a contributor (the one-photo tutorial) and 1 for an
 * annotator (util/tutorialVersion.js). Both are set only on the first
 * completion (no `tutorialCompletedAt` and `hasCompletedTutorial` not yet
 * true), so a replay never changes them. Contributors who finished before
 * S30 have neither, and did version 1: a replay writes nothing new to them.
 *
 * The tutorial page calls this and then refreshes the signed-in session, since
 * the session token isn't re-read from the database on every request.
 *
 * Takes no request body; it only ever sets the flag for the current user.
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

    // The first completion, before the flag is set: an account that had
    // already completed it (before S30, so version 1) is not given a date and
    // version by a replay, and neither is one that has them
    const user = await users.findOne({ _id }, { projection: { role: 1 } });
    await users.updateOne(
      { _id, hasCompletedTutorial: { $ne: true }, tutorialCompletedAt: { $exists: false } },
      { $set: { tutorialCompletedAt: new Date(), tutorialVersion: tutorialVersionFor(user?.role === "annotator") } }
    );
    await users.updateOne({ _id }, { $set: { hasCompletedTutorial: true } });

    return res.status(200).json({ message: "Tutorial completion saved successfully" });
  } catch (error) {
    console.error("Error updating tutorial status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
