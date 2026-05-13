import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { ObjectId } from "mongodb";

const handler = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?._id) {
    return res.status(401).json({ message: "Unauthorized: Please log in." });
  }

  const { db } = await connectToDatabase();
  const { activity, tag, date } = req.body;
  const userId = session.user._id;

  await db
    .collection("users")
    .updateOne(
      { _id: new ObjectId(userId) },
      { $push: { activities: { activity, date, tag } } }
    );

  res.status(200).json({ message: "Activity logged." });
};

export default handler;
