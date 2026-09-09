import { getServerSession } from "next-auth/next";
import { authOptions } from "./[...nextauth]";
import { connectToDatabase } from "@/util/mongodb";
import { USERNAME_PATTERN } from "@/util/validation";

/**
 * POST /api/auth/choose-username — saves the username a Google sign-in picks.
 *
 * Google supplies an email address and a display name, but annotations are
 * credited by username, so someone signing in this way can't contribute until
 * they choose one. The dashboard sends anyone in that state to
 * /choose-username, and this is where that form submits.
 *
 * Creates the account record if it doesn't exist yet — for a first-time Google
 * sign-in, this is the point at which the account is created.
 */
export default function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method not allowed" });
    }

    // Wrapped so the outer function stays sync — Next.js is happy with either,
    // but this keeps the method guard above from needing an await
    return (async () => {
        try {
            const session = await getServerSession(req, res, authOptions);

            if (!session || !session.user || !session.user.email) {
                return res.status(401).json({ message: "Unauthorized. Please log in first." });
            }

            const { username } = req.body;

            // Type check first: an object here would sail past the length check
            // (undefined > 50 is false), reach findOne as a Mongo operator, and
            // then get stored as the account's username.
            if (typeof username !== "string" || !username.trim()) {
                return res.status(400).json({ message: "Please choose a username." });
            }

            if (!USERNAME_PATTERN.test(username)) {
                return res.status(422).json({
                    message: "Username must be 3-30 characters, using letters, numbers, dots, underscores, or hyphens.",
                });
            }

            const { db } = await connectToDatabase();

            // Excluding our own email matters on a re-submit: without it,
            // someone confirming the name they already picked would collide
            // with their own record and be told it's taken.
            const existingUserWithUsername = await db.collection("users").findOne({
                username: username,
                email: { $ne: session.user.email }
            });

            if (existingUserWithUsername) {
                return res.status(409).json({ message: "Username is already taken" });
            }

            // $set for what Google owns and may have changed since last login;
            // $setOnInsert for the fields that define a fresh account and must
            // never be reset by someone revisiting this page
            const updateDoc = {
                $set: {
                    email: session.user.email,
                    name: session.user.name || "",
                    image: session.user.image || "",
                    username,
                    updatedAt: new Date(),
                },
                $setOnInsert: {
                    createdAt: new Date(),
                    role: "user",
                    totalAnnotations: 0,
                    hasCompletedTutorial: false,
                    activities: [
                        {
                            activity: "Registered to Imprint",
                            date: new Date(),
                            tag: "register",
                        },
                    ],
                }
            };

            await db.collection("users").updateOne(
                { email: session.user.email },
                updateDoc,
                { upsert: true }
            );

            return res.status(200).json({ message: "Username saved successfully" });
        } catch (error) {
            console.error("Error saving username:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    })();
}
