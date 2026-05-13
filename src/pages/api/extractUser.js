import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { ObjectId } from "mongodb";

// Extracts info from the logged in user to get activities, total annotations, etc
const handler = async (req, res) => {
  if (req.method === "POST") {
    const session = await getServerSession(req, res, authOptions);
    if (!session || !session.user?._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { db } = await connectToDatabase();
    const userId = session.user._id;

    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(userId) }, { projection: { activities: 1, totalAnnotations: 1 } });

    res.json({
      annotationCount: user?.totalAnnotations ?? 0,
      userActivities: user?.activities ?? [],
    });
  }
};

export default handler;
