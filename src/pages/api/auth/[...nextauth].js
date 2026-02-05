import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/util/mongodb";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "username", type: "text", placeholder: "username" },
        password: { label: "Password", type: "password" },
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
  ],
  pages: {
    signIn: "/login", // Redirects here if not logged in
    error: "/login",  // Redirects here on error
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.user = user;
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

export default NextAuth(authOptions);