import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { ObjectId } from "mongodb";

const handler = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: "Unauthorized: Please log in." });
  }

  const { id } = req.query;

  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid annotation ID." });
  }

  try {
    const { db } = await connectToDatabase();

    const annotationRecord = await db
      .collection("annotations")
      .findOne({ _id: new ObjectId(id) });

    if (!annotationRecord) {
      return res.status(404).json({ message: "Annotation not found." });
    }

    const imageRecord = await db
      .collection("Image")
      .findOne({ _id: new ObjectId(annotationRecord.imageID) });

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
