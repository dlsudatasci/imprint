import { getServerSession } from "next-auth/next";
import { authOptions } from "./[...nextauth]";
import { connectToDatabase } from "@/util/mongodb";
import { validateDemographics, validateOccupation, validateCities } from "@/util/validators/completeProfile";
import { newAccountFields } from "@/util/validators/newAccountRole";

/**
 * POST /api/auth/complete-profile — saves a contributor's demographic answers.
 *
 * This is research data rather than profile decoration. Imprint studies how
 * people with different mobility needs judge the same sidewalk, so these
 * answers are what make the annotations meaningful afterwards.
 *
 * The cities someone says they walk regularly also affect the platform:
 * /api/annotationGet hands out images from those cities first, on the reasoning
 * that people judge streets they actually walk more accurately than ones they
 * have only seen in a photograph.
 *
 * Completing this is what unlocks starting a real annotation session.
 */
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

            const {
                frequentlyWalkedCities,
                age,
                gender,
                disability,
                commuteFrequency,
                educationalAttainment,
                occupation,
                walkingFrequency,
                accessibilityFamiliarity,
                priorAnnotationExperience,
                temporaryMobility,
            } = req.body;

            const demoResult = validateDemographics({
                age, gender, disability, commuteFrequency,
                educationalAttainment, walkingFrequency,
                accessibilityFamiliarity, priorAnnotationExperience,
                temporaryMobility,
            });
            if (!demoResult.valid) {
                return res.status(400).json({ message: demoResult.message });
            }

            const occResult = validateOccupation(occupation);
            if (!occResult.valid) {
                return res.status(400).json({ message: occResult.message });
            }

            const cityResult = validateCities(frequentlyWalkedCities);
            if (!cityResult.valid) {
                return res.status(422).json({ message: cityResult.message });
            }

            const cities = Array.isArray(frequentlyWalkedCities) ? frequentlyWalkedCities : [];

            const { db } = await connectToDatabase();

            // Upsert rather than update: a Google user can reach this page
            // before any row exists for them, if they complete the profile
            // before picking a username.
            const updateDoc = {
                $set: {
                    email: session.user.email,
                    name: session.user.name || "",
                    image: session.user.image || "",
                    frequentlyWalkedCities: cities,
                    age,
                    gender,
                    disability,
                    commuteFrequency,
                    educationalAttainment,
                    occupation: occupation.trim(),
                    walkingFrequency,
                    accessibilityFamiliarity,
                    priorAnnotationExperience,
                    temporaryMobility,
                    updatedAt: new Date(),
                },
                $setOnInsert: {
                    createdAt: new Date(),
                    // role "user" (contributor), or with SIGNUP_ROLE=annotator
                    // on the server, role "annotator" and the annotator fields
                    // (see newAccountRole). On insert only, so an existing
                    // account keeps its role and fields.
                    ...newAccountFields(),
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

            return res.status(200).json({ message: "Profile successfully completed" });
        } catch (error) {
            console.error("Error completing profile:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    })();
}
