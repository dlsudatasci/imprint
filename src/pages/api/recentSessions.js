import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { ObjectId } from "mongodb";
import { countObstructions, pageParams, sessionPlaces, SESSION_THUMBNAILS } from "@/util/validators/recentSessions";
import { sceneAnswersOf } from "@/util/validators/sceneScale.mjs";

/**
 * GET|POST /api/recentSessions — the session history shown on the dashboard.
 *
 * Returns finished sessions a page at a time (22 Oct 2026): `?offset=0&limit=5`
 * by default, the five most recent, and `hasMore` when there are older ones,
 * for the dashboard's Show more. Any active session comes first on the first
 * page only, flagged, so the dashboard can offer Resume within the same list,
 * and is not one of the five. Each session sends every photo's obstruction
 * count in order, the cities it was in by name, and five thumbnails.
 *
 * Sessions where nothing was completed are excluded, so opening a batch and
 * leaving immediately doesn't produce an empty row.
 *
 * Note this runs a couple of queries per session in a loop. That is fine at a
 * limit of eight, but worth combining into a single query if the limit grows.
 *
 * Annotators get their sessions too (21 Oct 2026). From 4 Oct 2026 they got an
 * empty list, and from 6 Oct the dashboard showed them none of its lower half;
 * both are back for them now. Their rows have no accessibility average, since
 * annotators answer no scene-level questions (see below).
 */
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user?._id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { db } = await connectToDatabase();
    const userId = session.user._id;
    const { offset, limit } = pageParams(req.query);

    // 1. Fetch completed or abandoned sessions for the user, sorted by newest
    // first: this page, and one more to know whether there are older ones
    const found = await db
      .collection("sessions")
      .find({ 
        userId: userId, 
        status: { $in: ["completed", "abandoned"] },
        "completedImageIDs.0": { $exists: true } 
      })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit + 1)
      .toArray();
    const hasMore = (found?.length ?? 0) > limit;
    const sessions = (found || []).slice(0, limit);

    const recentSessions = [];

    // 2. For each session, gather its details
    for (const s of sessions) {
      const completedImageIDs = s.completedImageIDs || [];
      if (completedImageIDs.length === 0) continue;

      // Fetch the annotations corresponding to this session's images
      const annotations = await db
        .collection("annotations")
        .find({
          userId: userId,
          imageID: { $in: completedImageIDs }
        })
        .toArray();
      
      // Calculate Chart Data & Average Score
      let totalScore = 0;
      let validScores = 0;
      const chartData = [];
      // Photos per city, so the cities are named most photos first
      const photosByCity = new Map();
      
      // Create a map for quick annotation lookup
      const annotationMap = {};
      annotations.forEach((ann) => {
        annotationMap[ann.imageID] = ann;
        
        // On the scale where higher is better, 5 Easily accessible, rows
        // answered before 22 Oct 2026 turned round (validators/sceneScale.mjs).
        // The fields before sceneLevel (sceneRatings, the 1 to 10 slider's
        // accessibilityRating) are no longer averaged in: no one knows which
        // way they ran, and the public figure never counted them.
        const rating = sceneAnswersOf(ann)?.overallAccessibility;
        if (rating !== undefined && rating !== null) {
          totalScore += Number(rating);
          validScores++;
        }
        
        if (ann.city) {
          photosByCity.set(ann.city, (photosByCity.get(ann.city) || 0) + 1);
        }
      });

      // A batch tops up from other cities when the user's own run dry, so a
      // session can legitimately span several. They are named, most photos
      // first ("Makati, San Juan and 2 more"; "Several cities" until 22 Oct
      // 2026). null when no annotation names a city, and the row then shows
      // the date alone.
      const places = sessionPlaces(photosByCity);
      
      // null when nothing in the session has an accessibility answer, as for
      // annotators, who answer no scene-level questions (decided 3 Oct 2026).
      // The dashboard hides the score then instead of showing "-".
      const averageScore = validScores > 0 ? (totalScore / validScores).toFixed(1) : null;

      // Thumbnails. The three-way $or is legacy tolerance: completedImageIDs
      // has been written as ObjectIds, as ObjectId strings, and (currently, via
      // annotationSubmit) as the numeric Image.imageID. Old sessions are still
      // in the collection, so all three shapes have to resolve.
      //
      // Worth a migration to one representation — then this collapses to a
      // single $in and the string-compare matching below goes away too.
      let images = await db
        .collection("Image")
        .find({
          $or: [
            { _id: { $in: completedImageIDs } },
            { _id: { $in: completedImageIDs.map(id => { try { return new ObjectId(id); } catch { return null; } }).filter(Boolean) } },
            { imageID: { $in: completedImageIDs } }
          ]
        })
        .toArray();

      const imageUrls = [];
      for (const imgId of completedImageIDs) {
        if (imageUrls.length >= SESSION_THUMBNAILS) break;
        const matchedImg = images.find(img => 
          img._id.toString() === String(imgId) || 
          String(img.imageID) === String(imgId)
        );
        if (matchedImg) {
          imageUrls.push(matchedImg.url || matchedImg.imageUrl || matchedImg.src || "");
        }
      }

      // Obstructions per image, in the order they were annotated, so the
      // chart reads left to right as the session went. Only boxes answered
      // Yes count (countObstructions, 17 Oct 2026). Every photo is sent (22
      // Oct 2026): they used to be averaged into five buckets.
      for (const imgId of completedImageIDs) {
        chartData.push(countObstructions(annotationMap[imgId]));
      }

      recentSessions.push({
        id: s._id,
        date: s.completedAt || s.abandonedAt || s.createdAt,
        location: places.label,
        cities: places.names,
        totalImages: completedImageIDs.length,
        imageUrls: imageUrls,
        chartData: chartData,
        averageScore: averageScore
      });
    }
    // 4. Also fetch the active session if it exists and prepend it, on the
    // first page only, so Show more never repeats it
    const activeSession = offset === 0 ? await db.collection("sessions").findOne({ userId: userId, status: "active" }) : null;
    if (activeSession) {
      const activeImageIDs = activeSession.imageIDs || [];
      const completedImageIDs = activeSession.completedImageIDs || [];
      const totalImages = activeSession.totalCount || activeImageIDs.length;
      const currentCount = activeSession.currentCount || Math.min(completedImageIDs.length + 1, totalImages);
      
      let activeImages = await db.collection("Image").find({
         $or: [
           { _id: { $in: activeImageIDs } },
           { _id: { $in: activeImageIDs.map(id => { try { return new ObjectId(id); } catch { return null; } }).filter(Boolean) } },
           { imageID: { $in: activeImageIDs } }
         ]
      }).toArray();

      const activeImageUrls = [];
      for (const imgId of activeImageIDs) {
        if (activeImageUrls.length >= SESSION_THUMBNAILS) break;
        const matchedImg = activeImages.find(img => 
          img._id.toString() === String(imgId) || 
          String(img.imageID) === String(imgId)
        );
        if (matchedImg) {
          activeImageUrls.push(matchedImg.url || matchedImg.imageUrl || matchedImg.src || "");
        }
      }

      recentSessions.unshift({
        id: activeSession._id,
        isActive: true,
        date: activeSession.createdAt,
        location: null,
        cities: [],
        totalImages: totalImages,
        currentCount: currentCount,
        imageUrls: activeImageUrls,
        chartData: [],
        averageScore: 0
      });
    }

    return res.status(200).json({ sessions: recentSessions, hasMore });
  } catch (error) {
    console.error("Failed to fetch recent sessions:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
