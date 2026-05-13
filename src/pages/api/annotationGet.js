import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { ObjectId } from "mongodb";

/**
 * POST /api/annotationGet
 * 
 * Retrieves images for a user to annotate. 
 * Workflow:
 * 1. Checks if the user already has an active session. If so, restores it.
 * 2. If no active session, fetches new images based on the user's walked cities.
 * 3. Merges any of the user's existing edits (from the `annotations` collection) 
 *    with the baseline ground-truth data so they can resume where they left off.
 */

const handler = async (req, res) => {
  if (req.method === "POST") {
    const session = await getServerSession(req, res, authOptions);

    if (!session || !session.user?._id) {
      return res.status(401).json({ message: "Unauthorized: Please log in." });
    }

    const { db } = await connectToDatabase();
    const userId = session.user._id;
    const username = session.user.username;

    const { annotationTotalCount } = req.body;

    // 1. Check for an existing active session
    const existingSession = await db.collection("sessions").findOne({
      userId: userId,
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
          userId: userId,
          imageID: { $in: imageNumberIDs },
        })
        .toArray();

      // Build an O(1) Hash Map for fast lookups
      const userAnnotationsMap = userAnnotations.reduce((acc, curr) => {
        acc[curr.imageID] = curr;
        return acc;
      }, {});

      // Merge user annotations into the image payload
      for (const img of sortedImgRecords) {
        const annotation = userAnnotationsMap[img.imageID];
        if (annotation) {
          // Build a Hash Map of edited boxes for fast merging
          const editedBoxMap = (annotation.selectedObjectsID || []).reduce((acc, curr) => {
            acc[curr.id] = curr;
            return acc;
          }, {});

          // Merge user annotations into the original ground-truth list
          const mergedAnnotationList = (img.annotationList || []).map(originalBox => {
            return editedBoxMap[originalBox.id] || originalBox;
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

    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
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
        userId: userId,
        imageID: { $in: imageNumberIDs },
      })
      .toArray();

    // Build an O(1) Hash Map for fast lookups
    const userAnnotationsMap = userAnnotations.reduce((acc, curr) => {
      acc[curr.imageID] = curr;
      return acc;
    }, {});

    // Merge user annotations into the image payload
    for (const img of imgRecords) {
      const annotation = userAnnotationsMap[img.imageID];
      if (annotation) {
        // Build a Hash Map of edited boxes for fast merging
        const editedBoxMap = (annotation.selectedObjectsID || []).reduce((acc, curr) => {
          acc[curr.id] = curr;
          return acc;
        }, {});

        // Merge user annotations into the original ground-truth list
        const mergedAnnotationList = (img.annotationList || []).map(originalBox => {
          return editedBoxMap[originalBox.id] || originalBox;
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
      userId: userId,
      username: username, // Keep for readability
      imageIDs: imageIDs,
      totalCount: annotationTotalCount,
      status: "active",
      createdAt: new Date(),
    });

    await logTelemetryEvent({
      event: "SESSION_START",
      userId: userId,
      username: username,
      sessionTotalCount: annotationTotalCount,
    });

    res.json({
      imgRecords: imgRecords,
      isExistingSession: false,
    });
  }
};

export default handler;
