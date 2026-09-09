import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/util/mongodb";
import {
  USERNAME_PATTERN,
  EMAIL_PATTERN,
  MAX_EMAIL_LENGTH,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "@/util/validation";

/**
 * POST /api/auth/register — creates a password account.
 *
 * The email address is never verified, so it counts as a way to contact someone
 * rather than proof of who they are. That is why signing in with Google will
 * not attach itself to an account created here: without verification, typing an
 * address can't be treated as owning it.
 *
 * Only creates the account. The browser signs in straight afterwards, and the
 * demographic questions come later at /complete-profile.
 */
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
    } = req.body;

    // --- SECURITY VALIDATION ---
    // Everything here is untrusted and two of the three end up in a Mongo
    // query, so confirm they're strings before doing anything else with them.
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      typeof email !== "string"
    ) {
      return res.status(422).json({ message: "Missing required fields." });
    }

    if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) {
      return res.status(422).json({ message: "Invalid email address." });
    }

    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      return res.status(422).json({
        message: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
      });
    }

    if (!USERNAME_PATTERN.test(username)) {
      return res.status(422).json({
        message: "Username must be 3-30 characters, using letters, numbers, dots, underscores, or hyphens.",
      });
    }

    // ---------------------------

    // Checked separately so the form can highlight the field that's actually
    // the problem. Both leak whether an account exists, which is the accepted
    // trade for a usable signup — the reset flow is where that's guarded.
    //
    // These are checks, not constraints: two simultaneous signups can both pass
    // here. Add unique indexes on users.email and users.username to close it.
    const existingEmail = await db.collection("users").findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ message: "This email is already registered." });
    }

    const existingUser = await db.collection("users").findOne({ username });
    if (existingUser) {
      return res.status(409).json({ message: "This username is taken." });
    }

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
      activities,
      totalAnnotations: 0,
      hasCompletedTutorial: false,
      role: "user",
      createdAt: dateRegistered,
      updatedAt: dateRegistered,
    });

    return res.status(201).json({ message: "User created successfully" });

  } catch (error) {
    console.error("Registration Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export default handler;