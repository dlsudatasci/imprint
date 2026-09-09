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
        const { username, password } = credentials ?? {};

        // Both values land in a Mongo query / bcrypt call, so make sure they're
        // actually strings. A JSON login body could otherwise pass
        // {"username": {"$ne": null}} and have findOne match an arbitrary user.
        if (typeof username !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await db.collection("users").findOne({ username });

        // Accounts created through Google have no password to compare against
        if (!user || typeof user.hashedPassword !== "string") {
          return null;
        }

        if (await bcrypt.compare(password, user.hashedPassword)) {
          return user;
        }
        return null;
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
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
    /**
     * Runs when someone signs in.
     *
     * Registering never proves you own the email address you typed, so a Google
     * sign-in must not quietly adopt a password account that happens to use the
     * same address. Otherwise someone could register under your address, wait
     * for you to sign in with Google, and end up holding a password to your
     * account. When a password account already uses the address, this sends
     * them to the password form rather than linking the two.
     */
    signIn: async ({ user, account }) => {
      if (account?.provider !== "google" || !user?.email) return true;

      try {
        const { db } = await connectToDatabase();
        const existing = await db
          .collection("users")
          .findOne({ email: user.email }, { projection: { hashedPassword: 1 } });

        if (existing && typeof existing.hashedPassword === "string") {
          return "/login?error=UsePassword";
        }
      } catch (error) {
        // Fail closed: if we can't tell whether linking is safe, don't link
        console.error("Sign-in linking check failed", error);
        return false;
      }

      return true;
    },

    /**
     * Builds the token that becomes the sign-in cookie.
     *
     * Runs on every request, but the `user` argument is only filled in on the
     * first sign-in. This token is the whole session — nothing re-reads the
     * user record per request, which is fast but means a change written
     * straight to the database won't appear until the token is rebuilt.
     *
     * Two things work around that staleness:
     *
     *   - onboarding steps ask the browser to refresh the session, which
     *     arrives here as an update
     *   - pages that can't tolerate an out-of-date value, such as the
     *     dashboard's tutorial flag and annotation total, read the database
     *     directly on the server instead
     */
    jwt: async ({ token, user, account, trigger, session }) => {
      // Onboarding progress, pushed up from the client after choose-username,
      // complete-profile, or finishing the tutorial. These only ever clear a
      // "you still need to do X" flag, so there's nothing to gain by forging
      // one — the underlying write already happened through its own endpoint.
      if (trigger === "update" && session) {
        if (session.username) {
          token.user.username = session.username;
          token.user.isNewGoogleUser = false;
        }
        if (session.profileCompleted) {
          token.user.isProfileIncomplete = false;
        }
        if (session.tutorialCompleted) {
          token.user.hasCompletedTutorial = true;
        }
      }

      if (user) {
        token.user = user;
        // ObjectId doesn't survive JWT serialization; every downstream consumer
        // expects a string and wraps it back up with new ObjectId()
        if (token.user._id) {
          token.user._id = token.user._id.toString();
        }

        if (account && account.provider === "google") {
          try {
            const { db } = await connectToDatabase();
            // Google hands us a profile, not our user row. Look up the real
            // record so returning users get their _id, username, and stats
            // instead of a blank-looking account. The signIn callback above has
            // already ruled out the case where this email belongs to a password
            // account, so adopting the record here is safe.
            const dbUser = await db.collection("users").findOne({ email: user.email });

            if (dbUser && dbUser.username) {
              token.user = {
                ...dbUser,
                _id: dbUser._id.toString()
              };
            } else {
              // Either brand new, or they bailed out of /choose-username last
              // time. Either way they still owe us a username.
              token.user.isNewGoogleUser = true;
            }
          } catch (error) {
            // Fail toward asking again — an extra onboarding prompt is a much
            // better outcome than a session with no username attached
            console.error("Error connecting to database during Google callback", error);
            token.user.isNewGoogleUser = true;
          }
        }

        // Two gates the UI reads constantly. Missing username means they can't
        // be attributed, so /choose-username; missing age means the demographic
        // survey is unanswered, so /complete-profile. Both derive from the
        // record rather than being stored, so they can't get out of sync.
        token.user.isNewGoogleUser = !token.user.username;
        token.user.isProfileIncomplete = !token.user.age;
      }

      // Backfill for tokens minted before _id was part of the session. Those
      // cookies are still valid for up to 30 days, and every authenticated
      // endpoint keys off session.user._id, so without this their owners get
      // 401s until the token expires.
      if (token.user && !token.user._id && token.user.username) {
        try {
          const { db } = await connectToDatabase();
          const dbUser = await db.collection("users").findOne({ username: token.user.username });
          if (dbUser) {
            token.user._id = dbUser._id.toString();
          }
        } catch (error) {
          console.error("Failed to self-heal token _id", error);
        }
      }

      return token;
    },
    
    /**
     * Session Callback — what the browser actually gets to see.
     *
     * The token carries the whole user document, so this strips it down before
     * it reaches the client. Two reasons to remove things here:
     *
     *   hashedPassword              must never leave the server, full stop
     *   age, city, mobilityAids,    the demographic and research answers behind
     *   commuteFrequency,           the study. The UI only needs to know
     *   educationalAttainment,      *whether* the profile is filled in
     *   occupation,                 (isProfileIncomplete, computed above),
     *   walkingFrequency,           not the answers themselves
     *   accessibilityFamiliarity,
     *   priorAnnotationExperience
     *   activities                  potentially hundreds of entries; the
     *                               dashboard fetches them separately rather
     *                               than paying for them on every request,
     *                               since the session rides along in a cookie
     *
     * Denylist rather than allowlist, which means a new field added to the user
     * document is exposed by default — worth checking when you add one.
     */
    session: async ({ session, token }) => {
      if (token.user) {
        const sessionUser = { ...token.user };
        delete sessionUser.age;
        delete sessionUser.city;
        delete sessionUser.hashedPassword;
        delete sessionUser.mobilityAids;
        delete sessionUser.commuteFrequency;
        delete sessionUser.activities;
        delete sessionUser.educationalAttainment;
        delete sessionUser.occupation;
        delete sessionUser.walkingFrequency;
        delete sessionUser.accessibilityFamiliarity;
        delete sessionUser.priorAnnotationExperience;

        session.user = sessionUser;
      }
      return session;
    },
  },
};

/**
 * Wraps NextAuth so "Remember me for 30 days" can actually change the cookie
 * lifetime. Session maxAge is fixed at config time, but the checkbox is a
 * per-login choice — so the options object is rebuilt on the credentials
 * callback, reading the flag off the same POST that carries the password.
 *
 * Only that one request matters: maxAge is read when the cookie is issued, and
 * the credentials callback is the request that issues it.
 */
export default async function auth(req, res) {
  const isCredentialsCallback =
    req.method === "POST" &&
    req.query?.nextauth?.includes("callback") &&
    req.query?.nextauth?.includes("credentials");

  let customOptions = { ...authOptions };

  if (isCredentialsCallback) {
    // Arrives as a string — signIn() serializes the checkbox through the form body
    const rememberMe = req.body?.rememberMe === "true";

    // Unchecked means a day; checked falls through to NextAuth's 30-day
    // default. Google sign-ins never reach here and always get the 30 days.
    if (!rememberMe) {
      customOptions.session = {
        ...customOptions.session,
        maxAge: 24 * 60 * 60,
      };
    }
  }

  return await NextAuth(req, res, customOptions);
}