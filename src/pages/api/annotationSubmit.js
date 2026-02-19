import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

const handler = async (req, res) => {
  if (req.method === "POST") {
    const session = await getServerSession(req, res, authOptions);

    if (!session) {
      return res.status(401).json({ message: "Unauthorized: Please log in." });
    }

    const { db } = await connectToDatabase();
    console.log("post route");
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
    } = req.body;

    if (!imageID || !city) {
      return res.status(400).json({ message: "Missing required fields (imageID or city)." });
    }

    try {
      // CHANGED: Use updateOne with upsert: true instead of insertOne
      // This ensures that if the user annotates the same image twice, it updates the old one.
      await db.collection("annotations").updateOne(
        { imageID: imageID, username: username }, // Search Criteria
        {
          $set: {
            date, // Updates the timestamp
            city,
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
        { username: username, status: "active" },
        { $addToSet: { completedImageIDs: imageID } }
      );

      console.log(
        `User: ${username} submitted/updated annotation for ImageID: ${imageID}`
      );

      return res.status(200).json({ message: "Annotation submitted successfully." });

    } catch (error) {
      console.error("Database Error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  } else {
    // Handle non-POST requests
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
};

export default handler;
