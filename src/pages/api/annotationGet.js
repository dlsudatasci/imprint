import { connectToDatabase } from "@/util/mongodb";

const handler = async (req, res) => {
  if (req.method === "POST") {
    const { db } = await connectToDatabase();

    const { annotationTotalCount, username } = req.body;
    console.log("username:", username);

    // 1. Check for an existing active session
    const existingSession = await db.collection("sessions").findOne({
      username: username,
      status: "active",
    });

    if (existingSession) {
      console.log("Found existing active session for user:", username);
      const imgRecords = await db
        .collection("Image")
        .find({ _id: { $in: existingSession.imageIDs } })
        .toArray();

      // Ensure the order matches the session's imageIDs
      const sortedImgRecords = existingSession.imageIDs
        .map((id) => imgRecords.find((img) => img._id.toString() === id.toString()))
        .filter((img) => img !== undefined);

      const completedCount = existingSession.completedImageIDs
        ? existingSession.completedImageIDs.length
        : 0;

      // Ensure we don't go past the total
      const currentCount = Math.min(completedCount + 1, existingSession.totalCount);

      return res.json({
        imgRecords: sortedImgRecords,
        isExistingSession: true,
        currentCount: currentCount,
      });
    }

    // 2. No active session, create a new one
    if (!annotationTotalCount) {
      return res.json({
        imgRecords: [],
        message: "No active session found and no count provided.",
      });
    }

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
        { $limit: annotationTotalCount },
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
          { $limit: remaining },
        ])
        .toArray();

      imgRecords = imgRecords.concat(additional);
    }

    // 3. Save the new session
    const imageIDs = imgRecords.map((img) => img._id);
    await db.collection("sessions").insertOne({
      username: username,
      imageIDs: imageIDs,
      totalCount: annotationTotalCount,
      status: "active",
      createdAt: new Date(),
    });

    console.log("🧭 Annotation Request - New Session Created:");
    console.log("Requested count:", annotationTotalCount);
    console.log(
      "Returned image cities:",
      imgRecords.map((img) => img.city)
    );

    res.json({
      imgRecords: imgRecords,
      isExistingSession: false,
    });
  }
};

export default handler;
