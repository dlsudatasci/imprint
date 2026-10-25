import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/util/mongodb";
import {
  USERNAME_PATTERN,
  EMAIL_PATTERN,
  MAX_EMAIL_LENGTH,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "@/util/validation";
import { newAccountFields } from "@/util/validators/newAccountRole";
import { normalizeEmail, verificationExpiry } from "@/util/validators/emailVerification.mjs";
import { createVerificationToken, sendVerificationEmail } from "@/util/verificationEmail";

/**
 * POST /api/auth/register — creates a password account.
 *
 * The address is stored trimmed and lowercased (S9), so the unique index on
 * users.email allows one account per address whatever its case. The account
 * starts unconfirmed (emailVerifiedAt null) and this sends "Confirm your email
 * for IMPRINT" with a link to /verify-email that works for 24 hours. Until the
 * link is opened a contributor cannot annotate (needsEmailVerification). If the
 * mail cannot be sent the account is still created, emailSent is false, and the
 * person can send a new link from /check-email at once.
 *
 * Signing in with Google still will not attach itself to an account created
 * here, confirmed or not: the password account was made by whoever typed the
 * address first.
 *
 * Only creates the account. The browser signs in straight afterwards and goes to
 * /check-email, and the demographic questions come later at /complete-profile.
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
      consentAgreed,
      ageConfirmed,
    } = req.body;
    // Trimmed and lowercased before it is checked, compared or stored (S9)
    const email = normalizeEmail(req.body.email);

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

    if (consentAgreed !== true) {
      return res.status(422).json({ message: "You must agree to the Informed Consent Form." });
    }
    if (ageConfirmed !== true) {
      return res.status(422).json({ message: "You must confirm that you are at least 18 years old." });
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
    const { token, hashedToken } = createVerificationToken();

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
      // role "user" (contributor), or with SIGNUP_ROLE=annotator on the
      // server, role "annotator" and the annotator fields. A contributor also
      // gets isPilot true while SIGNUP_PILOT=true (see newAccountRole)
      ...newAccountFields(),
      consentAgreedAt: dateRegistered,
      ageConfirmedAt: dateRegistered,
      // Email verification (S9): only the token's hash is stored
      emailVerifiedAt: null,
      emailVerifyToken: hashedToken,
      emailVerifyExpire: verificationExpiry(dateRegistered),
      emailVerifySentAt: dateRegistered,
      createdAt: dateRegistered,
      updatedAt: dateRegistered,
    });

    // A failed send keeps the account. The send time is cleared so the person
    // can ask for a new link straight away instead of waiting five minutes.
    let emailSent = true;
    try {
      await sendVerificationEmail({ to: email, username, token });
    } catch (mailError) {
      emailSent = false;
      console.error("Verification email failed:", mailError);
      try {
        await db.collection("users").updateOne({ email }, { $set: { emailVerifySentAt: null } });
      } catch (resetError) {
        console.error("Could not clear emailVerifySentAt:", resetError);
      }
    }

    return res.status(201).json({ message: "User created successfully", emailSent });

  } catch (error) {
    console.error("Registration Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export default handler;