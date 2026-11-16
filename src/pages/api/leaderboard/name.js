import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { toUserId } from "@/util/leaderboard.mjs";

/**
 * POST /api/leaderboard/name — a contributor's choice to show their username
 * on the leaderboard or a number instead (S32, 17 Nov 2026).
 *
 * Body `{ show: true | false }`. Sets `users.leaderboardName` ("shown" or
 * "hidden") and `users.leaderboardChoiceAt`. Names are read fresh on every
 * GET /api/leaderboard, so the next one shows the change.
 *
 * Signed-in contributors only: annotators and admins are never on the board,
 * so they have nothing to choose. Each choice is logged as
 * LEADERBOARD_NAME_CHOSEN.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?._id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const show = req.body?.show;
  if (typeof show !== "boolean") {
    return res.status(400).json({ message: "show must be true or false" });
  }

  try {
    const { db } = await connectToDatabase();
    const users = db.collection("users");
    const userId = String(session.user._id);
    const _id = toUserId(userId);
    const user = await users.findOne({ _id }, { projection: { role: 1 } });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role != null && user.role !== "user") return res.status(403).json({ message: "Contributors only" });

    const nameChoice = show ? "shown" : "hidden";
    await users.updateOne({ _id }, { $set: { leaderboardName: nameChoice, leaderboardChoiceAt: new Date() } });
    await logTelemetryEvent({ event: "LEADERBOARD_NAME_CHOSEN", userId, shown: show });

    return res.status(200).json({ nameChoice });
  } catch (error) {
    console.error("Failed to save the leaderboard name choice:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
