import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { needsEmailVerification, EMAIL_NOT_VERIFIED_RESPONSE } from "@/util/validators/emailVerification.mjs";
import { authOptions } from "./auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { ObjectId } from "mongodb";
import { SCENE_SCALE } from "@/util/validators/sceneScale.mjs";
import { SESSION_CHANGED_CODES } from "@/util/validators/sessionSync";
import {
  validateSceneLevel,
  validateBoxes,
  isPresenceAnswer,
  RELOAD_FOR_NEW_QUESTIONS,
  normalizeAnnotatorSubmission,
  validateAnnotatorBoxes,
  normalizeSubmittedMarks,
  hasEmptyBox,
  applyRecordSuggestions,
  clearDrawnModelFields,
  withRecordConfidences,
} from "@/util/validators/annotationSubmit";
import { DEFAULT_MODEL_VERSION } from "@/util/validators/annotationGet";
import { filterAnnotationsByTau } from "@/util/validators/telemetryPayload";
import { capPosition, completedCount, sessionTotal, wasSent } from "@/util/validators/sessionPosition";
import { sessionTau } from "@/util/validators/tauSetting.mjs";
import { sanitizeDeviceTelemetry, sanitizeQcTelemetry, classifyBrowser } from "@/util/validators/deviceTelemetry";
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

    // The form validates these too, but the endpoint is reachable directly.
    // The model version, confidences and initialState come from the image
    // record, not the body (S5).
    const {
      imageID,
      currentAnnotationCount,
      telemetry,
      canvasVersion,
      sceneScale,
      hasSidewalk: sentHasSidewalk,
    } = req.body;
    let { sceneLevel, selectedObjectsID, newObjects, sidewalkMask } = req.body;

    if (imageID === undefined || imageID === null) {
      return res.status(400).json({ message: "Missing required field: imageID." });
    }

    // The role decides what is validated and stored, so it is read before
    // validation. It comes from the database, not the session, because an
    // admin can change it after sign-in. So does the email check (S9): a
    // contributor whose address is not confirmed cannot submit.
    let isAnnotator;
    try {
      const userRecord = await db.collection("users").findOne(
        { _id: new ObjectId(userId) },
        { projection: { role: 1, emailVerifiedAt: 1 } }
      );
      if (needsEmailVerification(userRecord)) {
        return res.status(403).json(EMAIL_NOT_VERIFIED_RESPONSE);
      }
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
    // Contributors' Step 1 (S15): a sidewalk (true) or only a path (false).
    // Annotators have no Step 1, so their rows never get one.
    const hasSidewalk = isAnnotator ? null : sentHasSidewalk;
    if (isAnnotator) {
      ({ sceneLevel, selectedObjectsID, newObjects, sidewalkMask } = normalizeAnnotatorSubmission({
        sceneLevel,
        selectedObjectsID,
        newObjects,
        sidewalkMask,
      }));
      boxResult = validateAnnotatorBoxes(selectedObjectsID, newObjects);
    } else {
      // Only a tab opened before S15 sends no Step 1 answer, since the form
      // asks for it before anything else
      if (!isPresenceAnswer(hasSidewalk)) {
        return res.status(422).json({ message: RELOAD_FOR_NEW_QUESTIONS });
      }
      const sceneResult = validateSceneLevel(sceneLevel, hasSidewalk);
      if (!sceneResult.valid) {
        return res.status(422).json({ message: sceneResult.message });
      }
      // The six keys, null where not asked, as checked
      sceneLevel = sceneResult.sceneLevel;
      boxResult = validateBoxes(selectedObjectsID, newObjects, { requireSeverity: true, hasSidewalk });
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

      // Both refusals carry a code, so the tool can tell the session changed
      // (in another tab or on another device) and load the current one
      // (validators/sessionSync.js, 23 Oct 2026)
      if (!activeSession) {
        return res.status(409).json({ message: "No active session to submit against.", code: SESSION_CHANGED_CODES.noSession });
      }

      const imageRecord = await db.collection("Image").findOne(
        { imageID: imageID, _id: { $in: activeSession.imageIDs || [] } },
        { projection: { city: 1, width: 1, height: 1, annotationList: 1, poolStatus: 1, isReference: 1, sidewalkAgreement: 1, modelVersion: 1 } }
      );

      if (!imageRecord) {
        return res.status(403).json({ message: "That image is not part of your current session.", code: SESSION_CHANGED_CODES.otherSession });
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

      // Both roles (S5, 29 Oct 2026): only this image's suggestions may be
      // submitted, each stored with the record's confidence and initialState,
      // and drawn boxes with no confidence. The classifier's proposal and
      // whether it was shown come from the record too (S3).
      const suggestions = imageRecord.annotationList || [];
      const matched = applyRecordSuggestions(selectedObjectsID, suggestions, { isAnnotator, hasSidewalk });
      if (!matched.valid) {
        return res.status(422).json({ message: matched.message });
      }
      selectedObjectsID = matched.boxes;
      newObjects = clearDrawnModelFields(newObjects);

      // The suggestion threshold the session was shown with (S2), never one
      // the client sends
      const tau = await sessionTau(db, activeSession);

      // Annotators: every suggestion the tool shows must be decided.
      // Suggestions hidden by the confidence threshold are never shown, so
      // they may be missing.
      if (isAnnotator) {
        const submittedIds = new Set(selectedObjectsID.map((b) => String(b.id)));
        const { visible } = filterAnnotationsByTau(suggestions, tau);
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
      const newScale = Boolean(sceneLevel) && sceneScale === SCENE_SCALE;
      await db.collection("annotations").updateOne(
        { imageID: imageID, userId: userId },
        {
          $set: {
            date,
            city,
            username,
            // The model the record's suggestions came from (S5), as
            // annotationGet serves it
            servedModelVersion: isAnnotator ? null : (imageRecord.modelVersion || DEFAULT_MODEL_VERSION),
            source: isAnnotator ? "annotator" : "contributor",
            sceneLevel,
            // Contributors' Step 1 (S15), beside the scene answers it decides
            ...(isAnnotator ? {} : { hasSidewalk }),
            schemaVersion: 2,
            selectedObjectsID,
            newObjects,
            // Annotators only. Contributors get no sidewalkMask field at all.
            ...(isAnnotator ? { sidewalkMask } : {}),
            // Marks drawn after the photo frame fix (9 Oct 2026). Only the
            // exact value 2 is stored. Anything else stores nothing, so the
            // analysis treats the marks as made on the old, offset canvas.
            ...(canvasVersion === 2 ? { canvasVersion: 2 } : {}),
            // Scene answers on the scale where higher is better (22 Oct 2026,
            // validators/sceneScale.mjs). Only the exact value is stored, and
            // only with answers: a page loaded before the change sends none,
            // so its old-scale answers are stored unmarked and read as old.
            ...(newScale ? { sceneScale: SCENE_SCALE } : {}),
            status: "pending",
          },
          // An earlier answer to this photo on the new scale does not mark this one
          ...(newScale ? {} : { $unset: { sceneScale: "" } }),
        },
        { upsert: true }
      );

      // $addToSet, not $push — clicking Previous and resubmitting must not add
      // the same image to the completed list twice, or the abandon path would
      // over-count it.
      //
      // S20 (7 Nov 2026): one atomic update that adds the photo and returns
      // the session as it was before, so a photo already sent in this session
      // is known to be a resend (logged as IMAGE_RESUBMITTED below, so every
      // per-photo figure counts it once), and the position is then capped at
      // the next unfinished photo (validators/sessionPosition.js). No active
      // session by now: nothing to update, and not a resend.
      const sessionFilter = { userId: userId, status: "active" };
      const sessionBefore = await db.collection("sessions").findOneAndUpdate(
        sessionFilter,
        { $addToSet: { completedImageIDs: imageID } },
        { returnDocument: "before", projection: { completedImageIDs: 1, imageIDs: 1, totalCount: 1 } }
      );
      const isResend = wasSent(sessionBefore, imageID);
      if (sessionBefore) {
        const completedAfter = { completedImageIDs: [...(sessionBefore.completedImageIDs || []), imageID] };
        const position = Number(currentAnnotationCount);
        if (Number.isInteger(position) && position >= 0) {
          await db.collection("sessions").updateOne(sessionFilter, {
            $set: {
              currentCount: capPosition(position, {
                total: sessionTotal(sessionBefore),
                completedCount: completedCount(completedAfter),
              }),
            },
          });
        }
      }

      // Timing and edit counts, used for the dashboard's speed and streak
      // stats. Best-effort: logTelemetryEvent swallows its own errors so a
      // telemetry outage can't cost someone their annotation.
      if (telemetry) {
        const cumulativeAnnotationsToDate = await db
          .collection("annotations")
          .countDocuments({ userId, status: "completed" });

        // The client's telemetry first and the server's fields after it, so a
        // client field named event, userId, username or imageID cannot replace
        // the server's (9 Oct 2026). A client timestamp is dropped:
        // logTelemetryEvent sets its own. Device fields are kept only with
        // allowed values, and the browser family comes from the User-Agent
        // header, which is never stored. The quality-check timing (S10) is
        // kept the same way, and only for contributors. Each suggestion's
        // confidence comes from the image record (S5), and so do its
        // proposal and whether the proposal was shown (S3). A photo sent again
        // in the same session is IMAGE_RESUBMITTED with the same payload (S20):
        // its timing runs from when it was reopened, and every reader of
        // IMAGE_SUBMITTED counts one event per photo.
        const sanitized = sanitizeQcTelemetry(sanitizeDeviceTelemetry(telemetry), { isAnnotator });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
        const { timestamp, ...clientTelemetry } = withRecordConfidences(sanitized, suggestions, { boxes: selectedObjectsID, isAnnotator, hasSidewalk });
        await logTelemetryEvent({
          ...clientTelemetry,
          event: isResend ? "IMAGE_RESUBMITTED" : "IMAGE_SUBMITTED",
          userId,
          username,
          imageID,
          // Contributors' Step 1 (S15), from the checked body, so Step 3's
          // time can be read by its length (six questions or two)
          ...(isAnnotator ? {} : { hasSidewalk }),
          browserFamily: classifyBrowser(req.headers?.["user-agent"]),
          // The threshold the server checked with (S2), over the client's
          tauThreshold: tau,
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
