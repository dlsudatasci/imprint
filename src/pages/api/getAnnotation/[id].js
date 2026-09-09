import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { ObjectId } from "mongodb";

/**
 * GET /api/getAnnotation/[id] — one submitted annotation, combined with the
 * image it belongs to.
 *
 * Returns the boxes a contributor drew, their judgements on the model's
 * suggestions, and their accessibility rating, alongside the image's own
 * details. Contributors can only read their own annotations.
 */
const handler = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?._id) {
    return res.status(401).json({ message: "Unauthorized: Please log in." });
  }

  const { id } = req.query;

  if (!id || Array.isArray(id) || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid annotation ID." });
  }

  try {
    const { db } = await connectToDatabase();

    // Match on the contributor as well as the id. Looking up by id alone
    // would let any signed-in user read everyone else's annotations, and the
    // usernames attached to them, by guessing ids.
    const annotationRecord = await db
      .collection("annotations")
      .findOne({ _id: new ObjectId(id), userId: session.user._id });

    if (!annotationRecord) {
      return res.status(404).json({ message: "Annotation not found." });
    }

    // The stored imageID is a plain number, not a database id. Converting it
    // to one throws and fails every request.
    const imageRecord = await db
      .collection("Image")
      .findOne({ imageID: annotationRecord.imageID });

    if (!imageRecord) {
      return res.status(404).json({ message: "Image not found." });
    }

    return res.json({
      imageID: annotationRecord.imageID,
      city: imageRecord.city,
      url: imageRecord.url,
      selectedObjects: annotationRecord.selectedObjectsID,
      detectedObjects: imageRecord.annotationList,
      newObjects: annotationRecord.newObjects,
      accessibilityRating: annotationRecord.accessibilityRating,
      sceneRatings: annotationRecord.sceneRatings,
      sceneLevel: annotationRecord.sceneLevel,
      pavementType: annotationRecord.pavementType,
      username: annotationRecord.username,
      date: annotationRecord.date,
    });
  } catch (error) {
    console.error("getAnnotation error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export default handler;
