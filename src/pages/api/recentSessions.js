import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { ObjectId } from "mongodb";

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

    // 1. Fetch completed or abandoned sessions for the user, sorted by newest first
    const sessions = await db
      .collection("sessions")
      .find({ 
        userId: userId, 
        status: { $in: ["completed", "abandoned"] },
        "completedImageIDs.0": { $exists: true } 
      })
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray();

    if (!sessions || sessions.length === 0) {
      return res.status(200).json({ sessions: [] });
    }

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
      const cities = new Set();
      
      // Create a map for quick annotation lookup
      const annotationMap = {};
      annotations.forEach((ann) => {
        annotationMap[ann.imageID] = ann;
        
        if (ann.accessibilityRating !== undefined && ann.accessibilityRating !== null) {
          totalScore += Number(ann.accessibilityRating);
          validScores++;
        }
        
        if (ann.city) {
          cities.add(ann.city);
        }
      });

      let location = "Unknown";
      if (cities.size === 1) {
        location = Array.from(cities)[0];
        if (location.toLowerCase().replace(/\s+/g, '') === 'laspinas') {
          location = 'Las Piñas';
        }
      } else if (cities.size > 1) {
        location = "Mixed Locations";
      }
      
      const averageScore = validScores > 0 ? (totalScore / validScores).toFixed(1) : 0;

      // 3. Fetch images to get their URLs
      // `Image` collection uses string IDs for completedImageIDs sometimes, or object IDs.
      // We will try finding by _id or imageID depending on how the session saved it.
      // The `annotationSubmit.js` saves `imageID` to `completedImageIDs`.
      // Let's assume they are the numeric/string IDs matching the Image collection's `imageID` or `_id`.
      
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
        if (imageUrls.length >= 3) break;
        const matchedImg = images.find(img => 
          img._id.toString() === String(imgId) || 
          String(img.imageID) === String(imgId)
        );
        if (matchedImg) {
          imageUrls.push(matchedImg.url || matchedImg.imageUrl || matchedImg.src || "");
        }
      }

      // For chart data, we want to respect the order of completedImageIDs if possible, 
      // or just map the annotations we have.
      for (const imgId of completedImageIDs) {
        const ann = annotationMap[imgId];
        if (ann) {
          const count = (ann.selectedObjectsID?.length || 0) + (ann.newObjects?.length || 0);
          chartData.push(count);
        } else {
          chartData.push(0);
        }
      }

      let finalChartData = chartData;
      if (chartData.length > 5) {
        const chunkSize = chartData.length / 5;
        finalChartData = [];
        for (let i = 0; i < 5; i++) {
          const start = Math.floor(i * chunkSize);
          const end = Math.floor((i + 1) * chunkSize);
          const chunk = chartData.slice(start, end);
          const sum = chunk.reduce((a, b) => a + b, 0);
          finalChartData.push(Math.round(sum / (chunk.length || 1)));
        }
      }

      recentSessions.push({
        id: s._id,
        date: s.completedAt || s.abandonedAt || s.createdAt,
        location: location,
        totalImages: completedImageIDs.length,
        imageUrls: imageUrls,
        chartData: finalChartData,
        averageScore: averageScore
      });
    }
    // 4. Also fetch the active session if it exists and prepend it
    const activeSession = await db.collection("sessions").findOne({ userId: userId, status: "active" });
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
        if (activeImageUrls.length >= 3) break;
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
        location: "Active Session",
        totalImages: totalImages,
        currentCount: currentCount,
        imageUrls: activeImageUrls,
        chartData: [],
        averageScore: 0
      });
    }

    return res.status(200).json({ sessions: recentSessions });
  } catch (error) {
    console.error("Failed to fetch recent sessions:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
