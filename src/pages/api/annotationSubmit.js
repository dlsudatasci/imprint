import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { ObjectId } from "mongodb";

// Generous ceiling — real images top out well under this. Exists so a scripted
// client can't push a multi-megabyte box array into a single document.
const MAX_BOXES_PER_IMAGE = 300;

/**
 * POST /api/annotationSubmit — saves the work done on one image.
 *
 * Runs every time a contributor moves to the next image, so it must be safe to
 * call twice for the same image. The write is keyed on the image and the
 * contributor together, so going back, changing an answer and submitting again
 * overwrites the earlier version rather than adding a second one.
 *
 * Everything saves as "pending" and only counts toward a contributor's total
 * once the batch ends, through /api/annotationComplete or
 * /api/annotationAbandon. That keeps an abandoned session from inflating the
 * platform's figures.
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

    // The form validates these too, but the endpoint is reachable directly
    const {
      imageID,
      servedModelVersion,
      sceneLevel,
      selectedObjectsID,
      newObjects,
      currentAnnotationCount,
      telemetry,
    } = req.body;

    if (imageID === undefined || imageID === null) {
      return res.status(400).json({ message: "Missing required field: imageID." });
    }

    // Scene-level battery: sidewalkPresent, surfaceCondition, walkability, overallAccessibility
    if (!sceneLevel || typeof sceneLevel !== "object") {
      return res.status(422).json({ message: "sceneLevel is required." });
    }
    const SIDEWALK_PRESENT = ["yes", "partial", "no"];
    if (!SIDEWALK_PRESENT.includes(sceneLevel.sidewalkPresent)) {
      return res.status(422).json({ message: "sceneLevel.sidewalkPresent must be yes, partial, or no." });
    }
    if (sceneLevel.sidewalkPresent === "no") {
      if (sceneLevel.surfaceCondition !== null && sceneLevel.surfaceCondition !== undefined) {
        return res.status(422).json({ message: "surfaceCondition must be null when there is no sidewalk." });
      }
    } else {
      const sc = Number(sceneLevel.surfaceCondition);
      if (!Number.isInteger(sc) || sc < 1 || sc > 4) {
        return res.status(422).json({ message: "sceneLevel.surfaceCondition must be 1–4 when a sidewalk is present." });
      }
    }
    const walkVal = Number(sceneLevel.walkability);
    if (!Number.isInteger(walkVal) || walkVal < 1 || walkVal > 5) {
      return res.status(422).json({ message: "sceneLevel.walkability must be an integer from 1 to 5." });
    }
    const accVal = Number(sceneLevel.overallAccessibility);
    if (!Number.isInteger(accVal) || accVal < 1 || accVal > 5) {
      return res.status(422).json({ message: "sceneLevel.overallAccessibility must be an integer from 1 to 5." });
    }

    if (!Array.isArray(selectedObjectsID) || !Array.isArray(newObjects)) {
      return res.status(422).json({ message: "selectedObjectsID and newObjects must be arrays." });
    }

    if (selectedObjectsID.length + newObjects.length > MAX_BOXES_PER_IMAGE) {
      return res.status(422).json({ message: "Too many boxes for a single image." });
    }

    // Every box must carry an explicit obstruction judgment, and obstructing
    // boxes must have a severity rating 1–5
    const allBoxes = [...selectedObjectsID, ...newObjects];
    for (const box of allBoxes) {
      if (typeof box.obstructs !== "boolean") {
        return res.status(422).json({ message: "Every object must have an obstruction judgment (obstructs: true/false)." });
      }
      if (box.obstructs === true) {
        const sev = Number(box.severity);
        if (!Number.isInteger(sev) || sev < 1 || sev > 5) {
          return res.status(422).json({ message: "Obstructing objects must have a severity rating from 1 to 5." });
        }
      }
    }

    try {
      const userRecord = await db.collection("users").findOne(
        { _id: new ObjectId(userId) },
        { projection: { role: 1 } }
      );
      const isAnnotator = userRecord?.role === "annotator";

      // Only accept submissions for images actually handed out in this user's
      // active session, and read the city off the Image record rather than
      // trusting the body — otherwise anyone can attribute annotations to a
      // city they were never shown and skew the public stats.
      const activeSession = await db.collection("sessions").findOne({
        userId: userId,
        status: "active",
      });

      if (!activeSession) {
        return res.status(409).json({ message: "No active session to submit against." });
      }

      const imageRecord = await db.collection("Image").findOne(
        { imageID: imageID, _id: { $in: activeSession.imageIDs || [] } },
        { projection: { city: 1 } }
      );

      if (!imageRecord) {
        return res.status(403).json({ message: "That image is not part of your current session." });
      }

      const city = imageRecord.city;

      // One row per (image, user) — resubmitting the same image replaces the
      // previous answer instead of stacking a second opinion from the same
      // person. Different users each get their own row, which is the whole
      // point: agreement between them is the signal the study is after.
      //
      // selectedObjectsID holds the model's suggestions the user ruled on
      // (kept or rejected); newObjects holds boxes they drew themselves.
      await db.collection("annotations").updateOne(
        { imageID: imageID, userId: userId },
        {
          $set: {
            date,
            city,
            username,
            servedModelVersion: isAnnotator ? null : (servedModelVersion || null),
            source: isAnnotator ? "annotator" : "contributor",
            sceneLevel,
            schemaVersion: 2,
            selectedObjectsID,
            newObjects,
            status: "pending",
          },
        },
        { upsert: true }
      );

      // $addToSet, not $push — clicking Previous and resubmitting must not add
      // the same image to the completed list twice, or the abandon path would
      // over-count it
      await db.collection("sessions").updateOne(
        { userId: userId, status: "active" },
        {
          $addToSet: { completedImageIDs: imageID },
          $set: { currentCount: currentAnnotationCount }
        }
      );

      // Timing and edit counts, used for the dashboard's speed and streak
      // stats. Best-effort: logTelemetryEvent swallows its own errors so a
      // telemetry outage can't cost someone their annotation.
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
