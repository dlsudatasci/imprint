import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { ObjectId } from "mongodb";
import {
  validateSceneLevel,
  validateBoxes,
  normalizeAnnotatorSubmission,
  validateAnnotatorBoxes,
  normalizeSubmittedMarks,
  hasEmptyBox,
} from "@/util/validators/annotationSubmit";
import { filterAnnotationsByTau, TAU_THRESHOLD } from "@/util/validators/telemetryPayload";
import {
  requiresSidewalkMask,
  normalizeSidewalkMask,
  validateSidewalkMask,
} from "@/util/validators/sidewalkMask";

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
      currentAnnotationCount,
      telemetry,
      canvasVersion,
    } = req.body;
    let { sceneLevel, selectedObjectsID, newObjects, sidewalkMask } = req.body;

    if (imageID === undefined || imageID === null) {
      return res.status(400).json({ message: "Missing required field: imageID." });
    }

    // The role decides what is validated and stored, so it is read before
    // validation. It comes from the database, not the session, because an
    // admin can change it after sign-in.
    let isAnnotator;
    try {
      const userRecord = await db.collection("users").findOne(
        { _id: new ObjectId(userId) },
        { projection: { role: 1 } }
      );
      isAnnotator = userRecord?.role === "annotator";
    } catch (error) {
      console.error("Database Error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }

    // Annotators do two steps per image (decided 4 Oct 2026): Objects (boxes
    // and categories, every suggestion kept or marked not an object), then
    // Obstructions (obstructs true or false on every real box). Scene answers
    // and severities are dropped here rather than refused, so the server
    // stores none. A real box without a Yes/No answer is refused.
    let boxResult;
    if (isAnnotator) {
      ({ sceneLevel, selectedObjectsID, newObjects, sidewalkMask } = normalizeAnnotatorSubmission({
        sceneLevel,
        selectedObjectsID,
        newObjects,
        sidewalkMask,
      }));
      boxResult = validateAnnotatorBoxes(selectedObjectsID, newObjects);
    } else {
      const sceneResult = validateSceneLevel(sceneLevel);
      if (!sceneResult.valid) {
        return res.status(422).json({ message: sceneResult.message });
      }
      boxResult = validateBoxes(selectedObjectsID, newObjects, { requireSeverity: true });
    }

    if (!boxResult.valid) {
      return res.status(422).json({ message: boxResult.message });
    }

    try {
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
        { projection: { city: 1, width: 1, height: 1, annotationList: 1, poolStatus: 1, isReference: 1, sidewalkAgreement: 1 } }
      );

      if (!imageRecord) {
        return res.status(403).json({ message: "That image is not part of your current session." });
      }

      // Both roles: a box drawn up or to the left, or resized past its
      // opposite edge, arrives with a negative size. Store it normalized and
      // clipped to the image. Marks are in the display copy's pixels, the same
      // space as Image.width and Image.height.
      selectedObjectsID = normalizeSubmittedMarks(selectedObjectsID, imageRecord.width, imageRecord.height);
      newObjects = normalizeSubmittedMarks(newObjects, imageRecord.width, imageRecord.height);
      if (hasEmptyBox(selectedObjectsID) || hasEmptyBox(newObjects)) {
        return res.status(422).json({ message: "A box has no area inside the image." });
      }

      // Annotators: every suggestion the tool shows must be decided, and only
      // this image's suggestions may be submitted. Suggestions hidden by the
      // confidence threshold are never shown, so they may be missing.
      if (isAnnotator) {
        const suggestions = imageRecord.annotationList || [];
        const knownIds = new Set(suggestions.map((a) => String(a.id)));
        const submittedIds = new Set(selectedObjectsID.map((b) => String(b.id)));
        if (selectedObjectsID.some((b) => !knownIds.has(String(b.id)))) {
          return res.status(422).json({ message: "A suggested box does not belong to this image." });
        }
        const { visible } = filterAnnotationsByTau(suggestions, TAU_THRESHOLD);
        if (visible.some((a) => !submittedIds.has(String(a.id)))) {
          return res.status(422).json({ message: "Every suggested box must be kept or marked not an object." });
        }

        // Sidewalk step (6 Oct 2026): model-development images and the
        // reference images flagged sidewalkAgreement need an outline, stored
        // normalized (clamped to the image, rounded). Other reference images
        // never get one, whatever the client sent.
        if (requiresSidewalkMask(imageRecord)) {
          sidewalkMask = normalizeSidewalkMask(sidewalkMask, imageRecord.width, imageRecord.height);
          const maskResult = validateSidewalkMask(sidewalkMask, imageRecord.width, imageRecord.height);
          if (!maskResult.valid) {
            return res.status(422).json({ message: maskResult.message });
          }
        } else {
          sidewalkMask = null;
        }
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
            // Annotators only. Contributors get no sidewalkMask field at all.
            ...(isAnnotator ? { sidewalkMask } : {}),
            // Marks drawn after the photo frame fix (9 Oct 2026). Only the
            // exact value 2 is stored. Anything else stores nothing, so the
            // analysis treats the marks as made on the old, offset canvas.
            ...(canvasVersion === 2 ? { canvasVersion: 2 } : {}),
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
        const cumulativeAnnotationsToDate = await db
          .collection("annotations")
          .countDocuments({ userId, status: "completed" });

        await logTelemetryEvent({
          event: "IMAGE_SUBMITTED",
          userId,
          username,
          imageID,
          ...telemetry,
          cumulativeAnnotationsToDate,
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
