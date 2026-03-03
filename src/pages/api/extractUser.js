import { connectToDatabase } from "@/util/mongodb";

// Extracts info from the logged in user to get activities, total annotations, etc
const handler = async (req, res) => {
  if (req.method === "POST") {
    const { db } = await connectToDatabase();
    const username = req.body;

    // Fetch user once — totalAnnotations and activities live on the same document
    const user = await db
      .collection("users")
      .findOne({ username: username }, { projection: { activities: 1, totalAnnotations: 1 } });

    res.json({
      annotationCount: user?.totalAnnotations ?? 0,
      userActivities: user?.activities ?? [],
    });
  }
};

export default handler;
