import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { ObjectId } from "mongodb";

/**
 * POST /api/user/completeTutorial — records that a contributor has finished the
 * walkthrough.
 *
 * The navbar and dashboard keep annotating locked until this is set, so it has
 * to be stored on the server. Keeping it only in the browser would make someone
 * repeat the tutorial on every new device.
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
    
    await db.collection("users").updateOne(
      { _id: new ObjectId(session.user._id) },
      { $set: { hasCompletedTutorial: true } }
    );

    return res.status(200).json({ message: "Tutorial completion saved successfully" });
  } catch (error) {
    console.error("Error updating tutorial status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
