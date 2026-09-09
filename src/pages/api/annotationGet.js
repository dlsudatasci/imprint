import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { normalizeCityName } from "@/util/cities";
import { ObjectId } from "mongodb";

/**
 * POST /api/annotationGet — gives the annotate page a batch of images to work
 * through.
 *
 * Called in two ways, told apart by whether the request carries a count:
 *
 *   {}                            "is anything already in progress?" Used by
 *                                 the navbar and dashboard to decide whether to
 *                                 offer Resume. Never creates a session.
 *   { annotationTotalCount: 10 }  "start a new batch of this size"
 *
 * A contributor has at most one active session, and an existing one always
 * wins — the requested count is ignored until the current batch is finished or
 * abandoned.
 *
 * Because the images and the progress position are stored server-side, a
 * session survives signing out or moving to another computer.
 */

// Session sizes the UI actually offers. Anything outside this set is either a
// typo or someone probing, and since the value drives a Mongo $limit we don't
// want to hand it straight to the database.
const ALLOWED_SESSION_SIZES = [5, 10, 20, 40];

// Annotators work through reference images, which are a fixed pool (~150).
// Larger minimum and maximum so they can cover more ground per session.
const ANNOTATOR_SESSION_SIZES = [10, 20, 40, 80];

/**
 * Applies a contributor's saved work back onto the raw image records.
 *
 * Image records carry the model's suggested boxes. Once someone has worked on
 * an image, their judgements on those suggestions and any boxes they drew
 * themselves live separately, in the annotations collection.
 *
 * Merging the two is what makes a resumed session look exactly as they left it.
 */
function ensureModelVersion(imgRecords) {
  for (const img of imgRecords) {
    if (!img.modelVersion) img.modelVersion = "v0-mapillary";
  }
}

async function mergeUserAnnotations(db, userId, imgRecords) {
  const imageNumberIDs = imgRecords.map((img) => img.imageID);

  const userAnnotations = await db
    .collection("annotations")
    .find({ userId, imageID: { $in: imageNumberIDs } })
    .toArray();

  const byImageID = new Map(userAnnotations.map((a) => [a.imageID, a]));

  for (const img of imgRecords) {
    const annotation = byImageID.get(img.imageID);
    if (!annotation) continue;

    // Their edits win over the original suggestion of the same id
    const edits = new Map(
      (annotation.selectedObjectsID || []).map((box) => [box.id, box])
    );

    img.annotationList = [
      ...(img.annotationList || []).map((box) => edits.get(box.id) || box),
      ...(annotation.newObjects || []),
    ];
    img.userSliderValue = annotation.accessibilityRating;
    img.userPavementType = annotation.pavementType;
    img.userSceneLevel = annotation.sceneLevel;
  }

  return imgRecords;
}

const handler = async (req, res) => {
  // Guard inverted so the happy path is not nested, matching publicStats.js.
  if (req.method !== "POST") {
    // Without this the request just hangs until the platform times it out
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  // Every await below talks to Mongo, and this was the one route in the API
  // without a top-level catch: a dropped connection surfaced as an unhandled
  // rejection with nothing logged, where every sibling returns a 500.
  try {
    const session = await getServerSession(req, res, authOptions);

    if (!session || !session.user?._id) {
      return res.status(401).json({ message: "Unauthorized: Please log in." });
    }

    const { db } = await connectToDatabase();
    const userId = session.user._id;
    const username = session.user.username;

    const { annotationTotalCount } = req.body;
    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const isAnnotator = user.role === "annotator";
    const allowedSizes = isAnnotator ? ANNOTATOR_SESSION_SIZES : ALLOWED_SESSION_SIZES;

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

      // $in gives no ordering guarantee, but the client walks this array by
      // index — "Sidewalk #3" has to be the same image every time they reload.
      // Reorder to match the sequence stored on the session.
      const sortedImgRecords = existingSession.imageIDs
        .map((id) => imgRecords.find((img) => img._id.toString() === id.toString()))
        .filter((img) => img !== undefined);

      ensureModelVersion(sortedImgRecords);

      if (isAnnotator) {
        for (const img of sortedImgRecords) {
          img.annotationList = [];
        }
      }

      await mergeUserAnnotations(db, userId, sortedImgRecords);

      const completedCount = existingSession.completedImageIDs
        ? existingSession.completedImageIDs.length
        : 0;

      // Prefer the explicitly saved position — someone who clicked Previous is
      // sitting on an image they've already submitted, so counting completions
      // would jump them forward again. Falling back to "one past the last
      // completed" covers sessions saved before currentCount was tracked.
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

    if (!allowedSizes.includes(annotationTotalCount)) {
      return res.status(400).json({
        message: `Invalid session size. Choose one of: ${allowedSizes.join(", ")}.`,
      });
    }

    // Images this contributor has already completed — never re-serve them.
    const completedImageIDs = await db
      .collection("annotations")
      .find({ userId, status: "completed" }, { projection: { imageID: 1 } })
      .toArray()
      .then((docs) => docs.map((d) => d.imageID));

    let imgRecords;

    if (isAnnotator) {
      // Annotators see reference images in random order, regardless of city.
      // They produce ground-truth labels, so they never see model suggestions.
      imgRecords = await db
        .collection("Image")
        .aggregate([
          { $match: { isReference: true, imageID: { $nin: completedImageIDs } } },
          { $addFields: { rand: { $rand: {} } } },
          { $sort: { rand: 1 } },
          { $limit: annotationTotalCount },
        ])
        .toArray();

      for (const img of imgRecords) {
        img.annotationList = [];
      }
    } else {
      // Mix ~1 in 8 reference images into each contributor session. These are
      // indistinguishable in the UI but let us measure contributor reliability
      // by comparing their answers to the annotator ground truth.
      const refCount = Math.max(1, Math.round(annotationTotalCount / 8));
      const regularCount = annotationTotalCount - refCount;

      const refImages = await db
        .collection("Image")
        .aggregate([
          { $match: { isReference: true, poolStatus: "served", imageID: { $nin: completedImageIDs } } },
          { $addFields: { rand: { $rand: {} } } },
          { $sort: { rand: 1 } },
          { $limit: refCount },
        ])
        .toArray();

      // Profiles store display names; Image.city stores slugs.
      const targetCities = (user.frequentlyWalkedCities || [])
        .map(normalizeCityName)
        .filter(Boolean);

      // City-first draw: people judge streets they actually walk more accurately.
      const needed = regularCount + (refCount - refImages.length);
      let regularImages = await db
        .collection("Image")
        .aggregate([
          {
            $match: {
              city: { $in: targetCities },
              poolStatus: "served",
              isReference: false,
              imageID: { $nin: completedImageIDs },
            },
          },
          { $addFields: { rand: { $rand: {} } } },
          { $sort: { rand: 1 } },
          { $limit: needed },
        ])
        .toArray();

      if (regularImages.length < needed) {
        const remaining = needed - regularImages.length;
        const additional = await db
          .collection("Image")
          .aggregate([
            {
              $match: {
                city: { $nin: targetCities },
                poolStatus: "served",
                isReference: false,
                imageID: { $nin: completedImageIDs },
              },
            },
            { $addFields: { rand: { $rand: {} } } },
            { $sort: { rand: 1 } },
            { $limit: remaining },
          ])
          .toArray();

        regularImages = regularImages.concat(additional);
      }

      // Shuffle reference images into the regular batch so they're not
      // clustered at the start or end.
      imgRecords = [...regularImages, ...refImages];
      for (let i = imgRecords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [imgRecords[i], imgRecords[j]] = [imgRecords[j], imgRecords[i]];
      }
    }

    const imageIDs = imgRecords.map((img) => img._id);

    ensureModelVersion(imgRecords);
    await mergeUserAnnotations(db, userId, imgRecords);

    // Pinning the image list now is what lets the session resume: the same
    // batch comes back on reload instead of a fresh random draw.
    await db.collection("sessions").insertOne({
      userId: userId,
      username: username, // Denormalized so session exports are readable
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
  } catch (error) {
    console.error("Database Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export default handler;
