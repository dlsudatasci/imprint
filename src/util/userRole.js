import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/util/mongodb";

/**
 * Whether the signed-in person is an annotator, read from the database. The
 * session token is only refreshed at sign-in, so a role set afterwards (the
 * Accounts tab, set-role.mjs) would be missed there. Used by the annotate and
 * tutorial pages' getServerSideProps (9 Oct 2026). False with no session, and
 * when the lookup fails, so the page falls back to the contributor view.
 */
export async function isAnnotatorUser(session) {
  const id = session?.user?._id;
  if (!id) return false;
  try {
    const { db } = await connectToDatabase();
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(id) }, { projection: { role: 1 } });
    return user?.role === "annotator";
  } catch (error) {
    console.error("isAnnotatorUser: role lookup failed:", error);
    return false;
  }
}
