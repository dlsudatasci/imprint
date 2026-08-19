import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { ObjectId } from "mongodb";

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
