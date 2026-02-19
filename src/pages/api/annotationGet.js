import { connectToDatabase } from "@/util/mongodb";

const handler = async (req, res) => {
  if (req.method === "POST") {
    const { db } = await connectToDatabase();

    const { annotationTotalCount, username } = req.body;

    // 1. Check for an existing active session
    const existingSession = await db.collection("sessions").findOne({
      username: username,
      status: "active",
    });

    if (existingSession) {
      const imgRecords = await db
        .collection("Image")
        .find({ _id: { $in: existingSession.imageIDs } })
        .toArray();

      // Ensure the order matches the session's imageIDs
      const sortedImgRecords = existingSession.imageIDs
        .map((id) => imgRecords.find((img) => img._id.toString() === id.toString()))
        .filter((img) => img !== undefined);

      // Fetch user's existing annotations for these images using the numeric id
      const imageNumberIDs = sortedImgRecords.map((img) => img.imageID);
      const userAnnotations = await db
        .collection("annotations")
        .find({
          username: username,
          imageID: { $in: imageNumberIDs },
        })
        .toArray();

      // Merge user annotations into the image payload
      for (const img of sortedImgRecords) {
        const annotation = userAnnotations.find((a) => a.imageID === img.imageID);
        if (annotation) {
          // Merge user annotations into the original ground-truth list
          const mergedAnnotationList = (img.annotationList || []).map(originalBox => {
            const userEdit = (annotation.selectedObjectsID || []).find(
              (editedBox) => editedBox.id === originalBox.id
            );
            return userEdit ? userEdit : originalBox;
          });

          const finalAnnotationList = [
            ...mergedAnnotationList,
            ...(annotation.newObjects || [])
          ];

          img.annotationList = finalAnnotationList;
          img.userSliderValue = annotation.accessibilityRating;
          img.userPavementType = annotation.pavementType;
        }
      }

      const completedCount = existingSession.completedImageIDs
        ? existingSession.completedImageIDs.length
        : 0;

      // Ensure we don't go past the total. If the user was on an earlier image (and clicked Previous),
      // we restore that specific image using the saved currentCount.
      const currentCount = existingSession.currentCount
        || Math.min(completedCount + 1, existingSession.totalCount);

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

    const imageIDs = imgRecords.map((img) => img._id);

    // Fetch user's existing annotations for these new images using the numeric id
    const imageNumberIDs = imgRecords.map((img) => img.imageID);
    const userAnnotations = await db
      .collection("annotations")
      .find({
        username: username,
        imageID: { $in: imageNumberIDs },
      })
      .toArray();

    // Merge user annotations into the image payload
    for (const img of imgRecords) {
      const annotation = userAnnotations.find((a) => a.imageID === img.imageID);
      if (annotation) {
        // Merge user annotations into the original ground-truth list
        const mergedAnnotationList = (img.annotationList || []).map(originalBox => {
          const userEdit = (annotation.selectedObjectsID || []).find(
            (editedBox) => editedBox.id === originalBox.id
          );
          return userEdit ? userEdit : originalBox;
        });

        const finalAnnotationList = [
          ...mergedAnnotationList,
          ...(annotation.newObjects || [])
        ];

        img.annotationList = finalAnnotationList;
        img.userSliderValue = annotation.accessibilityRating;
        img.userPavementType = annotation.pavementType;
      }
    }

    // 3. Save the new session
    await db.collection("sessions").insertOne({
      username: username,
      imageIDs: imageIDs,
      totalCount: annotationTotalCount,
      status: "active",
      createdAt: new Date(),
    });


    res.json({
      imgRecords: imgRecords,
      isExistingSession: false,
    });
  }
};

export default handler;
