import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { ObjectId } from "mongodb";

/**
 * POST /api/userActivity — appends one entry to a contributor's activity feed.
 *
 * The feed is what the dashboard shows as a record of what someone has done on
 * the platform. Only the signed-in contributor's own feed can be written.
 *
 * Entries are capped in two ways: length limits on the text, and only the most
 * recent hundred are kept. Both matter because the feed lives inside the user
 * record, which stops being writable at all if it grows past the database's
 * document size limit.
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

  const { activity, tag } = req.body;
  const userId = session.user._id;

  // The timestamp is set here rather than taken from the request, so entries
  // can't be backdated by whoever is calling.
  if (typeof activity !== "string" || typeof tag !== "string") {
    return res.status(400).json({ message: "activity and tag must be strings." });
  }

  if (!activity.trim() || activity.length > 200 || tag.length > 50) {
    return res.status(422).json({ message: "activity or tag is empty or too long." });
  }

  try {
    const { db } = await connectToDatabase();

    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      {
        $push: {
          activities: {
            $each: [{ activity, tag, date: new Date() }],
            // Keep only the most recent entries. The dashboard shows fewer,
            // and the user record has to stay under the size limit.
            $slice: -100,
          },
        },
      }
    );

    return res.status(200).json({ message: "Activity logged." });
  } catch (error) {
    console.error("Failed to log activity:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export default handler;
