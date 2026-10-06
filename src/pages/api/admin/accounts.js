/**
 * /api/admin/accounts — the admin Accounts tab (added 1 Oct 2026).
 *
 * GET   every account with username, email, role, sign-up date, whether the
 *       profile is complete, and number of annotations, plus signupRole: the
 *       role new sign-ups get from the server's SIGNUP_ROLE setting (6 Oct
 *       2026), so the tab can warn while every new account is an annotator.
 * POST  { action: "preview", userId }                    counts of what a deletion would remove
 *       { action: "delete",  userId, confirmName }        deletes the account and everything it
 *                                                         recorded; confirmName must be its username
 *                                                         (or email if it has none)
 *       { action: "role",    userId, role }               "user" (contributor) or "annotator"
 *
 * Admin accounts, including the caller's own, cannot be changed or deleted here.
 * A role change is refused (409) while the person has a session in progress.
 *
 * A deletion removes the users document, the person's annotations, sessions,
 * telemetry, NASA-TLX and exit-survey responses, and their entries in reference
 * images' referenceGroundTruth. Image annotationCount is left as it is (decided
 * 1 Oct 2026). An ACCOUNT_DELETED event records who deleted, when, and how many
 * records were removed, but nothing that identifies the deleted person.
 */
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/util/adminAuth";
import {
  USER_DATA_COLLECTIONS,
  checkAccountAction,
  roleUpdate,
  roleOf,
  summarizeAccount,
} from "@/util/validators/accountAdmin";
import { signupRole } from "@/util/validators/newAccountRole";

function ownedBy(target) {
  const id = String(target._id);
  const or = [{ userId: { $in: [id, new ObjectId(id)] } }];
  if (target.username) or.push({ username: target.username });
  return { $or: or };
}

async function countOwned(db, target) {
  const filter = ownedBy(target);
  const id = String(target._id);
  const counts = {};
  for (const c of USER_DATA_COLLECTIONS) counts[c] = await db.collection(c).countDocuments(filter);
  counts.referenceImages = await db
    .collection("Image")
    .countDocuments({ "referenceGroundTruth.userId": { $in: [id, new ObjectId(id)] } });
  return counts;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const { db, session } = auth;
  const actorId = session.user._id;

  try {
    if (req.method === "GET") {
      const users = await db
        .collection("users")
        .find({}, { projection: { username: 1, email: 1, role: 1, createdAt: 1, age: 1 } })
        .sort({ createdAt: -1 })
        .toArray();
      const perUser = await db
        .collection("annotations")
        .aggregate([{ $group: { _id: "$userId", n: { $sum: 1 } } }])
        .toArray();
      const counts = new Map(perUser.map((r) => [String(r._id), r.n]));
      const active = await db
        .collection("sessions")
        .find({ status: "active" }, { projection: { userId: 1 } })
        .toArray();
      const busy = new Set(active.map((s) => String(s.userId)));
      return res.status(200).json({
        accounts: users.map((u) =>
          summarizeAccount(u, counts.get(String(u._id)) || 0, actorId, busy.has(String(u._id)))
        ),
        signupRole: signupRole(),
      });
    }

    const { action, userId, confirmName, role } = req.body || {};
    if (typeof userId !== "string" || !ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid account id." });
    }
    const target = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    const hasActiveSession =
      action === "role" && target
        ? (await db
            .collection("sessions")
            .countDocuments({ userId: { $in: [userId, new ObjectId(userId)] }, status: "active" })) > 0
        : false;
    const check = checkAccountAction({ actorId, target, action, confirmName, role, hasActiveSession });
    if (!check.ok) return res.status(check.status).json({ message: check.message });

    if (action === "preview") {
      return res.status(200).json({ counts: await countOwned(db, target) });
    }

    if (action === "role") {
      const from = roleOf(target);
      await db.collection("users").updateOne({ _id: target._id }, roleUpdate(role));
      await db.collection("telemetry_logs").insertOne({
        event: "ROLE_CHANGED",
        userId: actorId,
        targetUserId: String(target._id),
        from,
        to: role,
        timestamp: new Date(),
      });
      return res.status(200).json({ message: "Role updated.", role });
    }

    // action === "delete"
    const filter = ownedBy(target);
    const id = String(target._id);
    const removed = {};
    for (const c of USER_DATA_COLLECTIONS) {
      removed[c] = (await db.collection(c).deleteMany(filter)).deletedCount;
    }
    removed.referenceImages = (
      await db.collection("Image").updateMany(
        { "referenceGroundTruth.userId": { $in: [id, new ObjectId(id)] } },
        { $pull: { referenceGroundTruth: { userId: { $in: [id, new ObjectId(id)] } } } }
      )
    ).modifiedCount;
    removed.users = (await db.collection("users").deleteOne({ _id: target._id })).deletedCount;

    const left = await countOwned(db, target);
    const leftUsers = await db.collection("users").countDocuments({ _id: target._id });
    const leftover = Object.values(left).reduce((a, b) => a + b, 0) + leftUsers;

    await db.collection("telemetry_logs").insertOne({
      event: "ACCOUNT_DELETED",
      userId: actorId,
      removed,
      complete: leftover === 0,
      timestamp: new Date(),
    });

    if (leftover !== 0) {
      return res.status(500).json({ message: "Deletion incomplete. Some records remain; check the database.", removed, left });
    }
    return res.status(200).json({ message: "Account deleted.", removed });
  } catch (error) {
    console.error("admin/accounts error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
