import { getServerSession } from "next-auth/next";
import { authOptions } from "./[...nextauth]";
import { connectToDatabase } from "@/util/mongodb";

export default function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method not allowed" });
    }

    return (async () => {
        try {
            const session = await getServerSession(req, res, authOptions);

            if (!session || !session.user || !session.user.email) {
                return res.status(401).json({ message: "Unauthorized. Please log in first." });
            }

            const { username } = req.body;

            if (!username) {
                return res.status(400).json({ message: "Please choose a username." });
            }

            if (username.length > 50) {
                return res.status(422).json({ message: "Username is too long." });
            }

            const { db } = await connectToDatabase();

            const existingUserWithUsername = await db.collection("users").findOne({
                username: username,
                email: { $ne: session.user.email }
            });

            if (existingUserWithUsername) {
                return res.status(409).json({ message: "Username is already taken" });
            }

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
