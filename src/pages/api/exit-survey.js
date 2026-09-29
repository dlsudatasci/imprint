/**
 * GET/POST /api/exit-survey — load or save a contributor's exit questionnaire.
 *
 * GET returns the existing survey for the authenticated user (or null).
 * POST validates and upserts the survey, logging EXIT_SURVEY_SUBMITTED.
 */
import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { validateExitSurveyPayload } from "@/util/validators/exitSurvey";

const handler = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?._id) {
    return res.status(401).json({ message: "Unauthorized: Please log in." });
  }

  const { db } = await connectToDatabase();
  const userId = session.user._id;

  if (req.method === "GET") {
    try {
      const existing = await db
        .collection("exit_surveys")
        .findOne({ userId }, { projection: { _id: 0, userId: 0 } });
      return res.status(200).json({ survey: existing || null });
    } catch (error) {
      console.error("Exit survey fetch error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }

  const result = validateExitSurveyPayload(req.body);
  if (!result.valid) {
    return res.status(422).json({ message: result.reason });
  }

  const now = new Date();

  try {
    await db.collection("exit_surveys").updateOne(
      { userId },
      {
        $set: {
          userId,
          responses: result.data.responses,
          updatedAt: now,
        },
        $setOnInsert: {
          completedAt: now,
        },
      },
      { upsert: true }
    );

    await logTelemetryEvent({
      event: "EXIT_SURVEY_SUBMITTED",
      userId,
      username: session.user.username,
    });

    return res.status(200).json({ message: "Exit survey saved." });
  } catch (error) {
    console.error("Exit survey save error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export default handler;
