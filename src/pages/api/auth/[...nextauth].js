import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/util/mongodb";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "username", type: "text", placeholder: "username" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember Me", type: "text" }
      },
      async authorize(credentials) {
        const { db } = await connectToDatabase();
        const { username, password } = credentials;

        // Find user by username
        const user = await db.collection("users").findOne({ username });

        // Verify password
        if (user && (await bcrypt.compare(password, user.hashedPassword))) {
          return user;
        }
        return null;
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    jwt: async ({ token, user, account, trigger, session }) => {
      // If the client calls `update({ username: ... })` to silently refresh the cookie mid-session
      if (trigger === "update" && session?.username) {
        token.user.username = session.username;
        token.user.isNewGoogleUser = false;
      }

      // This logic only runs on the very first sign-in when 'user' object is passed
      if (user) {
        token.user = user;

        if (account && account.provider === "google") {
          try {
            const { db } = await connectToDatabase();
            // Check if user already exists in DB AND has a username (fully complete profile)
            const dbUser = await db.collection("users").findOne({ email: user.email });

            if (dbUser && dbUser.username) {
              // They exist fully! Overwrite the default Google token.user with their full DB record
              token.user = {
                ...dbUser,
                _id: dbUser._id.toString()
              };
            } else {
              // They don't exist in DB yet, or exist but have an incomplete profile without a username
              token.user.isNewGoogleUser = true;
            }
          } catch (error) {
            console.error("Error connecting to database during Google callback", error);
            token.user.isNewGoogleUser = true; // Default to prompting completion on error to be safe
          }
        }
      }

      // Failsafe check: If the token was loaded from an older cookie and lacks a username, flag it.
      if (token.user && !token.user.username) {
        token.user.isNewGoogleUser = true;
      } else if (token.user && token.user.username) {
        // Ensure the flag is removed if they successfully registered it
        token.user.isNewGoogleUser = false;
      }

      return token;
    },
    session: async ({ session, token }) => {
      if (token.user) {
        const sessionUser = { ...token.user };
        // SECURITY: Remove sensitive or heavy data from the session
        delete sessionUser.age;
        delete sessionUser.city;
        delete sessionUser.hashedPassword;
        delete sessionUser.mobilityAids;
        delete sessionUser.commuteFrequency;
        delete sessionUser.activities;

        session.user = sessionUser;
      }
      return session;
    },
  },
};

export default async function auth(req, res) {
  const isCredentialsCallback =
    req.method === "POST" &&
    req.query?.nextauth?.includes("callback") &&
    req.query?.nextauth?.includes("credentials");

  let customOptions = { ...authOptions };

  if (isCredentialsCallback) {
    const rememberMe = req.body?.rememberMe === "true";

    // If user does not want to be remembered for 30 days,
    // expire the session in 24 hours (1 day).
    if (!rememberMe) {
      customOptions.session = {
        ...customOptions.session,
        maxAge: 24 * 60 * 60,
      };
    }
  }

  return await NextAuth(req, res, customOptions);
}