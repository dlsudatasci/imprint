import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { logTelemetryEvent } from "@/util/telemetryLogger";
import { buildLeaderboard, shouldLogView, toUserId } from "@/util/leaderboard.mjs";

/**
 * GET /api/leaderboard — the contributors' leaderboard (S32, 17 Nov 2026).
 *
 * Signed-in contributors and admins. Annotators get 403: they are paid, are
 * never on the board and have no use for it.
 *
 * Answers `{ updatedAt, top: [{ rank, name, photos, isYou }], you }`
 * (util/leaderboard.mjs). A row is a name and a count and nothing else: no
 * account id, email or city. The name is the username only for someone who
 * chose to show it, otherwise "Imprint Contributor #" and their number.
 *
 * Each view by a contributor is logged as LEADERBOARD_VIEWED with their rank
 * and count, at most once per person in 10 minutes, so the analysis can tell
 * when each contributor first saw the board.
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?._id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { db } = await connectToDatabase();
    const userId = String(session.user._id);
    // The role from the database: the login token keeps the one from sign-in
    const user = await db.collection("users").findOne({ _id: toUserId(userId) }, { projection: { role: 1 } });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "annotator") return res.status(403).json({ message: "Contributors only" });

    const board = await buildLeaderboard(db, userId);

    if (board.you && shouldLogView(userId)) {
      await logTelemetryEvent({ event: "LEADERBOARD_VIEWED", userId, rank: board.you.rank, photos: board.you.photos });
    }

    // Each answer marks the viewer's own row, so nothing in between may keep it
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(board);
  } catch (error) {
    console.error("Failed to build the leaderboard:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
