/**
 * POST /api/nasa-tlx — save a NASA-TLX workload assessment after a session.
 *
 * Accepts either a full submission (6 scales, 0-100 each) or a dismissal.
 * Upserts to the nasa_tlx collection keyed on userId + sessionId.
 */
import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { validateNasaTlxPayload } from "@/util/validators/nasaTlx";

const handler = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?._id) {
    return res.status(401).json({ message: "Unauthorized: Please log in." });
  }

  const result = validateNasaTlxPayload(req.body);
  if (!result.valid) {
    return res.status(422).json({ message: result.reason });
  }

  const { db } = await connectToDatabase();
  const userId = session.user._id;
  const { sessionId, sessionNumber, dismissed, responses } = result.data;
  const now = new Date();

  try {
    await db.collection("nasa_tlx").updateOne(
      { userId, sessionId },
      {
        $set: {
          userId,
          sessionId,
          sessionNumber,
          responses,
          dismissed,
          completedAt: dismissed ? null : now,
          dismissedAt: dismissed ? now : null,
        },
        $setOnInsert: {
          presentedAt: now,
        },
      },
      { upsert: true }
    );

    await logTelemetryEvent({
      event: dismissed ? "NASA_TLX_DISMISSED" : "NASA_TLX_SUBMITTED",
      userId,
      username: session.user.username,
      sessionId,
      sessionNumber,
    });

    return res.status(200).json({ message: "NASA-TLX response saved." });
  } catch (error) {
    console.error("NASA-TLX save error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export default handler;
