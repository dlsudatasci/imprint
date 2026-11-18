import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { ObjectId } from "mongodb";
import { hasUnreadMessage } from "@/util/notifications.mjs";
import { exitQuestionnaireState, hasLinkedInvitation, withoutInvitationLink } from "@/util/exitQuestionnaire.mjs";

/**
 * POST /api/extractUser — the signed-in contributor's activity feed and
 * running annotation total, for the dashboard.
 *
 * The query deliberately asks for only those fields, so the password hash
 * and the demographic answers never leave the server.
 *
 * S29 (16 Nov 2026): it also says whether a message in the feed is unread
 * (`hasUnreadMessage`, newer than `notificationsSeenAt`). With the body
 * `{ unread: true }` it answers only that boolean, reading only each entry's
 * tag and date: the navbar asks this on load to show the bell's dot, and
 * fetches the whole feed only when the tray opens.
 *
 * S33 (17 Nov 2026): the exit questionnaire invitation's bell message links
 * to the questionnaire until the person has answered it. Once they have, the
 * feed is sent without that link (util/exitQuestionnaire.mjs).
 */
const handler = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?._id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { db } = await connectToDatabase();
    const unreadOnly = req.body?.unread === true;

    const user = await db
      .collection("users")
      .findOne(
        { _id: new ObjectId(session.user._id) },
        {
          projection: unreadOnly
            ? { "activities.tag": 1, "activities.date": 1, notificationsSeenAt: 1 }
            : { activities: 1, totalAnnotations: 1, notificationsSeenAt: 1 },
        }
      );

    const unread = hasUnreadMessage(user?.activities, user?.notificationsSeenAt);
    if (unreadOnly) return res.json({ hasUnreadMessage: unread });

    let activities = user?.activities ?? [];
    if (hasLinkedInvitation(activities)) {
      const { answered } = await exitQuestionnaireState(db, session.user._id);
      if (answered) activities = withoutInvitationLink(activities);
    }

    return res.json({
      annotationCount: user?.totalAnnotations ?? 0,
      userActivities: activities,
      notificationsSeenAt: user?.notificationsSeenAt ?? null,
      hasUnreadMessage: unread,
    });
  } catch (error) {
    console.error("Failed to load user summary:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export default handler;
