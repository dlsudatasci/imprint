import { getServerSession } from "next-auth/next";
import { authOptions } from "./[...nextauth]";
import { connectToDatabase } from "@/util/mongodb";

// Mirrors the option lists rendered by /complete-profile. Keep the two in sync
// — both the allowlists here and the options arrays in the form component.
// If you add a choice to the form, add it here or the submit will 400.
const AGE_GROUPS = [
    "16-19", "20-24", "25-29", "30-34", "35-39", "40-44",
    "45-49", "50-54", "55-59", "60-64", "65+",
];
const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];
const DISABILITY_ANSWERS = ["No", "Yes", "Prefer not to say"];
const COMMUTE_FREQUENCIES = ["Daily", "A few times a week", "Once a week", "Rarely", "Never"];
const EDUCATION_LEVELS = [
    "High school", "Some college", "Bachelor's", "Master's",
    "Doctorate", "Other", "Prefer not to say",
];
const WALKING_FREQUENCIES = [
    "Daily", "Several times a week", "Once a week",
    "A few times a month", "Rarely", "Never",
];
const ACCESSIBILITY_FAMILIARITY = [
    "Very familiar", "Somewhat familiar",
    "Slightly familiar", "Not at all familiar",
];
const ANNOTATION_EXPERIENCE = ["Yes", "No"];

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
            } = req.body;

            // These are closed dropdowns in the UI, so accept only the values
            // the form can actually produce — this is survey data the study
            // depends on, and a direct POST could otherwise write anything.
            if (
                !AGE_GROUPS.includes(age) ||
                !GENDERS.includes(gender) ||
                !DISABILITY_ANSWERS.includes(disability) ||
                !COMMUTE_FREQUENCIES.includes(commuteFrequency) ||
                !EDUCATION_LEVELS.includes(educationalAttainment) ||
                !WALKING_FREQUENCIES.includes(walkingFrequency) ||
                !ACCESSIBILITY_FAMILIARITY.includes(accessibilityFamiliarity) ||
                !ANNOTATION_EXPERIENCE.includes(priorAnnotationExperience)
            ) {
                return res.status(400).json({ message: "Please fill in all required demographic fields." });
            }

            if (typeof occupation !== "string" || occupation.trim().length === 0 || occupation.length > 100) {
                return res.status(400).json({ message: "Occupation is required (max 100 characters)." });
            }

            // The cities field is a free-text creatable select, so it only gets
            // shape and volume limits rather than a fixed allowlist
            const cities = Array.isArray(frequentlyWalkedCities) ? frequentlyWalkedCities : [];
            if (cities.length > 20 || cities.some((c) => typeof c !== "string" || c.length > 80)) {
                return res.status(422).json({ message: "Too many cities, or a city name is too long." });
            }

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
                    updatedAt: new Date(),
                },
                $setOnInsert: {
                    createdAt: new Date(),
                    role: "user", // Default Role
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
