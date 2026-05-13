import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";

/**
 * POST /api/annotationSubmit
 * 
 * Handles saving an individual image annotation during an active session.
 * Upserts the annotation into the `annotations` collection with a "pending" status,
 * adds the imageID to the session's completed list, and logs telemetry.
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
    const date = new Date();

    // Required fields are done on the front end
    const {
      imageID,
      city,
      accessibilityRating,
      pavementType,
      selectedObjectsID,
      newObjects,
      currentAnnotationCount,
      telemetry,
    } = req.body;

    if (!imageID || !city) {
      return res.status(400).json({ message: "Missing required fields (imageID or city)." });
    }

    try {
      await db.collection("annotations").updateOne(
        { imageID: imageID, userId: userId }, // Search Criteria
        {
          $set: {
            date, // Updates the timestamp
            city,
            username, // Keep for display/reporting purposes
            accessibilityRating,
            pavementType,
            selectedObjectsID,
            newObjects,
            status: "pending", // Keep it pending until session completes
          },
        },
        { upsert: true } // Create if it doesn't exist
      );

      // Update the active session with the completed image
      await db.collection("sessions").updateOne(
        { userId: userId, status: "active" },
        {
          $addToSet: { completedImageIDs: imageID },
          $set: { currentCount: currentAnnotationCount }
        }
      );

      // Log the telemetry event
      if (telemetry) {
        await logTelemetryEvent({
          event: "IMAGE_SUBMITTED",
          userId,
          username,
          imageID,
          ...telemetry,
        });
      }

      return res.status(200).json({ message: "Annotation submitted successfully." });

    } catch (error) {
      console.error("Database Error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
};

export default handler;
