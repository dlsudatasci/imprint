import { connectToDatabase } from "@/util/mongodb";

// Extracts info from the logged in user to get activities, total annotations, etc
const handler = async (req, res) => {
  if (req.method === "POST") {
    const { db } = await connectToDatabase();
    const username = req.body;

    // Annotation Count
    const annotationCount = await db
      .collection("annotations")
      .countDocuments({ username: username, status: { $ne: "pending" } });


    // User Activities
    const user = await db
      .collection("users")
      .find({ username: username })
      .limit(1)
      .toArray();
    const userActivities = user[0].activities;

    res.json({
      annotationCount,
      userActivities,
    });
  }
};

export default handler;
