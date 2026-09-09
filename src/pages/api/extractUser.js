import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { ObjectId } from "mongodb";

/**
 * POST /api/extractUser — the signed-in contributor's activity feed and
 * running annotation total, for the dashboard.
 *
 * The query deliberately asks for only those two fields, so the password hash
 * and the demographic answers never leave the server.
 */
const handler = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?._id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { db } = await connectToDatabase();

    const user = await db
      .collection("users")
      .findOne(
        { _id: new ObjectId(session.user._id) },
        { projection: { activities: 1, totalAnnotations: 1 } }
      );

    return res.json({
      annotationCount: user?.totalAnnotations ?? 0,
      userActivities: user?.activities ?? [],
    });
  } catch (error) {
    console.error("Failed to load user summary:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export default handler;
