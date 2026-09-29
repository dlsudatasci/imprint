/**
 * Shared admin auth guard for all /api/admin/* routes.
 *
 * Verifies the session is authenticated and the user's role in the database
 * (not just the JWT) is "admin". Returns { session, db } on success or
 * sends 401/403 and returns null.
 */
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { connectToDatabase } from "@/util/mongodb";
import { ObjectId } from "mongodb";

export async function requireAdmin(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?._id) {
    res.status(401).json({ message: "Unauthorized: Please log in." });
    return null;
  }

  const { db } = await connectToDatabase();
  const user = await db
    .collection("users")
    .findOne({ _id: new ObjectId(session.user._id) }, { projection: { role: 1 } });

  if (!user || user.role !== "admin") {
    res.status(403).json({ message: "Forbidden: admin access required." });
    return null;
  }

  return { session, db };
}
