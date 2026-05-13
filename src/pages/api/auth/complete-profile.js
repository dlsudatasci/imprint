import { getServerSession } from "next-auth/next";
import { authOptions } from "./[...nextauth]";
import { connectToDatabase } from "@/util/mongodb";

export default function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method not allowed" });
    }

    // We wrap the async logic so we can cleanly return the Promise Next.js expects from API routes
    return (async () => {
        try {
            const session = await getServerSession(req, res, authOptions);

            if (!session || !session.user || !session.user.email) {
                return res.status(401).json({ message: "Unauthorized. Please log in first." });
            }

            const {
                frequentlyWalkedCities,
                age,
                gender,
                disability,
                commuteFrequency,
            } = req.body;

            if (!age || !gender || !disability || !commuteFrequency) {
                return res.status(400).json({ message: "Please fill in all required demographic fields." });
            }

            const { db } = await connectToDatabase();

            // 2. Upsert the user document with the new demographics
            const updateDoc = {
                $set: {
                    email: session.user.email, // from Google
                    name: session.user.name || "", // from Google
                    image: session.user.image || "", // from Google
                    frequentlyWalkedCities: frequentlyWalkedCities || [],
                    age,
                    gender,
                    disability,
                    commuteFrequency,
                    updatedAt: new Date(),
                },
                $setOnInsert: {
                    createdAt: new Date(),
                    role: "user", // Default Role
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

            return res.status(200).json({ message: "Profile successfully completed" });
        } catch (error) {
            console.error("Error completing profile:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    })();
}
