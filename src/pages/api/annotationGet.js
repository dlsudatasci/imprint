import { connectToDatabase } from "@/util/mongodb";

const handler = async (req, res) => {
  if (req.method === "POST") {
    const { db } = await connectToDatabase();

    const { annotationTotalCount, username } = req.body;
    console.log("username:", username);

    const user = await db.collection("users").findOne({ username });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const targetCities = [user.city, ...(user.frequentlyWalkedCities || [])];
    console.log("Target Cities:", targetCities);

    let imgRecords = await db
      .collection("Image")
      .aggregate([
        { $match: { city: { $in: targetCities } } },
        { $addFields: { rand: { $rand: {} } } },
        { $sort: { rand: 1 } },
        { $limit: annotationTotalCount }
      ])
      .toArray();

    if (imgRecords.length < annotationTotalCount) {
      const remaining = annotationTotalCount - imgRecords.length;
      const additional = await db
        .collection("Image")
        .aggregate([
          { $match: { city: { $nin: targetCities } } },
          { $addFields: { rand: { $rand: {} } } },
          { $sort: { rand: 1 } },
          { $limit: remaining }
        ])
        .toArray();

      imgRecords = imgRecords.concat(additional);
    }

    console.log("🧭 Annotation Request:");
    console.log("Requested count:", annotationTotalCount);
    console.log("Returned image cities:", imgRecords.map(img => img.city));

    res.json({
      imgRecords: imgRecords,
    });
  }
};

export default handler;
