import { useEffect, useState } from "react";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { useSession } from "next-auth/react";
import { connectToDatabase } from "@/util/mongodb";
import { ObjectId } from "mongodb";
import { readTotalCount, readCurrentCount, readTutorialFlag, clearSession } from "@/util/sessionCache";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

import Page from "@/ui/page";

import DashboardInfo from "../../features/contribute/dashboard/infoSection";

import { Button, Badge, Container } from "@/ui";
import ContentSkeleton from "@/features/layout/contentSkeleton";

const FUN_FACTS = [
  "Wheelchair ramps need a 1:12 max slope to be safe.",
  "1.3 billion people globally experience a disability.",
  "Tactile paving was invented in Japan in 1965.",
  "Safe wheelchair turning space is 1.5m minimum.",
  "Trees along sidewalks reduce surface heat by 10-20°C.",
  "Metro Manila is ranked among the least walkable cities.",
  "A standard wheelchair needs 0.9m clear width.",
  "Over 50% of the world lives in urban areas."
];

/**
 * The contributor dashboard, where everyone lands after signing in.
 *
 * It also enforces the order of onboarding: choose a username (Google sign-ins
 * only), finish the tutorial, complete the profile, then annotate. The main
 * button always shows whichever step is still outstanding, so there is one
 * obvious next action at any point.
 *
 * The values read from the database on the server (liveUser) take precedence
 * over the session held in the browser. The browser's copy comes from the login
 * token, which can be out of date for anything that changes outside signing in,
 * such as the role an admin sets.
 */
export default function ContributePage({ session, liveUser = null }) {
  const { data: clientSession, status } = useSession();
  const loading = status === "loading";

  const [sessionState, setSessionState] = useState({
    status: "loading", // "loading" | "active" | "none"
    current: 0,
    total: 0,
  });
  const [isTutorialSession, setIsTutorialSession] = useState(false);
  const [randomFact, setRandomFact] = useState("");

  // _app hands `session` to SessionProvider and never passes it to the page,
  // and useSession refetches the token's copy in the background (on window
  // focus, for one), whose role and progress can be days old. So the database
  // values come as their own prop, liveUser, and always win (6 Oct 2026, the
  // same approach as isAnnotator on the tutorial page). Before this, an
  // annotator made by changing the role in the database saw the contributor
  // dashboard again as soon as the token was refetched.
  const activeSession = session || clientSession;
  const user = { ...activeSession?.user, ...liveUser };
  const username = user.username || "";
  const userRole = user.role || "contributor";
  const userId = user._id || "";

  // getServerSideProps reads this straight from the database on every request,
  // so it stays correct even if the JWT is stale from another device
  const hasCompletedDemo = user.hasCompletedTutorial === true;

  useEffect(() => {
    // Picked client-side: choosing during SSR makes the server and client HTML
    // disagree and triggers a hydration error
    const randomIndex = Math.floor(Math.random() * FUN_FACTS.length);
    setRandomFact(FUN_FACTS[randomIndex]);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      setSessionState({ status: "none", current: 0, total: 0 });
      return;
    }

    if (status !== "authenticated") return;

    // A Google user without a username can't be credited for anything they
    // annotate, so this step isn't skippable. location.replace rather than
    // router.push keeps the dashboard out of history — Back would bounce them
    // right back here.
    if (activeSession?.user?.isNewGoogleUser) {
      window.location.replace("/choose-username");
      return;
    }

    if (!username) return;

    const checkSession = async () => {
      // 1. Check local storage first
      const localTotal = readTotalCount();
      const localCurrent = readCurrentCount();

      if (localTotal !== null && localCurrent !== null) {
        if (readTutorialFlag()) {
          setIsTutorialSession(true);
          setSessionState({ status: "none", current: 0, total: 0 });
        } else {
          setIsTutorialSession(false);
          setSessionState({
            status: "active",
            current: localCurrent,
            total: localTotal,
          });
        }
        return;
      }

      // 2. Fallback to checking server
      try {
        const response = await fetch("/api/annotationGet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!response.ok) {
          throw new Error("Server returned " + response.status);
        }

        const data = await response.json();

        if (data.isExistingSession) {
          setSessionState({
            status: "active",
            current: data.currentCount || 1,
            total: data.imgRecords.length,
          });
        } else {
          setSessionState({ status: "none", current: 0, total: 0 });
        }
      } catch (error) {
        console.error("Failed to check session", error);
        setSessionState({ status: "none", current: 0, total: 0 });
      }
    };

    checkSession();
  }, [status, username]);

  // No `typeof window` branch here: rendering different trees on the server and
  // on the client is precisely what breaks hydration. `loading` is true on both
  // for the first render, so gating on it alone is consistent.
  if (loading) {
    return (
      <Page title="Dashboard - Imprint Contribute" contribute>
        <ContentSkeleton />
      </Page>
    );
  }

  const hasSession = sessionState.status === "active";
  const isLoadingSession = sessionState.status === "loading";

  return (
    <Page
      title="Dashboard - Imprint Contribute"
      description="Contribute to Imprint! Let's make our streets accessible for all."
      contribute
    >
      <section className="pt-12 pb-6">
        <Container className="relative z-10">

          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">

            {/* Left Side: Welcome Text */}
            <div className="w-full md:w-auto">
              <p className="text-muted font-semibold text-xl mb-1">Welcome back,</p>
              <h1 className="font-display text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight text-primary">
                {username}.
              </h1>
              {userRole === "annotator" && (
                <Badge tone="success">Annotator</Badge>
              )}
            </div>

            {/* Right Side: Fun Fact & Action Buttons */}
            <div className="flex flex-col items-start md:items-end w-full md:w-auto mt-4 md:mt-0 gap-3">
              {/* Fun Fact Pill */}
              {!hasSession && !isTutorialSession && randomFact && (
                <Badge tone="warning">
                  <span>{randomFact}</span>
                </Badge>
              )}

              <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4 w-full md:w-auto">
              {isTutorialSession ? (
                <>
                  <Link href="/contribute/tutorial" className="flex-1 md:flex-none flex">
                    <Button fullWidth>Resume Tutorial</Button>
                  </Link>
                  {/* eslint-disable-next-line react/forbid-elements -- dashboard action button */}
                  <button
                    type="button"
                    onClick={() => {
                      clearSession();
                      setIsTutorialSession(false);
                    }}
                    className="flex-1 md:flex-none"
                  >
                    <Button variant="neutral" fullWidth>Stop Tutorial</Button>
                  </button>
                </>
              ) : !hasSession ? (
                <>
                  {!hasCompletedDemo ? (
                    <Link
                      href={isLoadingSession ? "" : "/contribute/tutorial"}
                      className={`flex-1 md:flex-none flex ${isLoadingSession ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <Button fullWidth>
                        {isLoadingSession ? "Loading..." : "Start Demo Tutorial"}
                      </Button>
                    </Link>
                  ) : user.isProfileIncomplete ? (
                    <Link href="/complete-profile" className="flex-1 md:flex-none flex">
                      <Button fullWidth>Complete Profile to Start</Button>
                    </Link>
                  ) : (
                    <Link
                      href={isLoadingSession ? "" : "/contribute/annotate"}
                      className={`flex-1 md:flex-none flex ${isLoadingSession ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <Button fullWidth>
                        {isLoadingSession ? "Loading..." : "Let's Annotate!"}
                      </Button>
                    </Link>
                  )}

                  {hasCompletedDemo && (
                     <Link href="/contribute/tutorial" className="flex-1 md:flex-none flex">
                        <Button variant="neutral" fullWidth>Replay Tutorial</Button>
                     </Link>
                  )}
                </>
              ) : hasSession ? (
                <>
                  <Link href="/contribute/annotate" className="flex-1 md:flex-none flex">
                    <Button fullWidth>Resume Session</Button>
                  </Link>
                  {/* eslint-disable-next-line react/forbid-elements -- dashboard action button */}
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await fetch("/api/annotationAbandon", { method: "POST" });
                        clearSession();
                        setSessionState({ status: "none", current: 0, total: 0 });
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="flex-1 md:flex-none"
                  >
                    <Button variant="neutral" fullWidth>Stop Session</Button>
                  </button>
                </>
              ) : null}
              </div>
            </div>
          </div>

        </Container>
      </section>
      {/* The lower dashboard (Recent Sessions, the distance banner, contribution
          figures) is for contributors only. Annotators see none of it (6 Oct 2026).
          userRole comes from the database, overlaid in getServerSideProps. */}
      {userRole !== "annotator" && <DashboardInfo username={username} userId={userId} />}
    </Page>
  );
}

export async function getServerSideProps(context) {
  // getServerSession reads the cookie in-process. The old getSession(context)
  // made an HTTP round trip back to our own /api/auth/session on every render.
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session || !session.user?._id) {
    return { props: { session: session ?? null, liveUser: null } };
  }

  let liveUser = null;

  try {
    const { db } = await connectToDatabase();
    const dbUser = await db.collection("users").findOne({ _id: new ObjectId(session.user._id) });

    // Read the live values. The JWT is only refreshed at login or on an
    // explicit update() call, so these can be stale by days — and all of
    // them gate what the page offers. Finishing the tutorial in
    // another tab should light up "Let's Annotate" here on the next load.
    if (dbUser) {
      liveUser = {
        totalAnnotations: dbUser.totalAnnotations || 0,
        hasCompletedTutorial: dbUser.hasCompletedTutorial || false,
        role: dbUser.role || "contributor",
      };
      if (dbUser.age) liveUser.isProfileIncomplete = false;

      // Still overlaid on the session too, so SessionProvider's first copy matches
      Object.assign(session.user, liveUser);
    }
  } catch (error) {
    // Fall through with the token's values — a stale dashboard beats an error
    // page, and every gated action re-checks server-side anyway
    console.error("Failed to fetch live user stats in dashboard getServerSideProps:", error);
  }

  return { props: { session, liveUser } };
}