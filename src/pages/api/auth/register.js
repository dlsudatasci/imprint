import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/util/mongodb";

const handler = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  try {
    const { db } = await connectToDatabase();
    const {
      username,
      password,
      email,
      city,
      frequentlyWalkedCities,
      age,
      commuteFrequency,
      referred,
    } = req.body;

    // --- SECURITY VALIDATION ---
    if (!username || !password || !email || !city) {
      return res.status(422).json({ message: "Missing required fields." });
    }

    if (!email.includes("@") || !email.includes(".")) {
      return res.status(422).json({ message: "Invalid email address." });
    }

    if (password.length < 6) {
      return res.status(422).json({ message: "Password must be at least 6 characters long." });
    }

    if (username.length > 50) {
      return res.status(422).json({ message: "Username is too long." });
    }
    // ---------------------------

    // Check for duplicates
    const existingEmail = await db.collection("users").findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ message: "This email is already registered." });
    }

    const existingUser = await db.collection("users").findOne({ username });
    if (existingUser) {
      return res.status(409).json({ message: "This username is taken." });
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Initial User Data
    const dateRegistered = new Date();
    const activities = [
      {
        activity: "Registered to Imprint",
        date: dateRegistered,
        tag: "register",
      },
    ];

    await db.collection("users").insertOne({
      username,
      hashedPassword,
      email,
      city,
      frequentlyWalkedCities,
      age,
      commuteFrequency,
      activities,
      totalAnnotations: 0,
      referred,
    });

    return res.status(201).json({ message: "User created successfully" });

  } catch (error) {
    console.error("Registration Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export default handler;