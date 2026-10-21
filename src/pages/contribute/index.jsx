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

import { Button, Badge, Container, ConfirmDialog } from "@/ui";
import { DASHBOARD_COPY as COPY } from "@/features/contribute/dashboard/dashboardCopy";
import ContentSkeleton from "@/features/layout/contentSkeleton";


/**
 * The contributor dashboard, where everyone lands after signing in.
 *
 * Audited 17 Oct 2026 (IMPRINT_dashboard_audit.md): its words come from
 * dashboardCopy.js and Stop Session asks first. The rotating "fun facts"
 * were removed (Rans, 17 Oct 2026).
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
  const [confirmStop, setConfirmStop] = useState(false);

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
      <Page title={COPY.pageTitle} contribute>
        <ContentSkeleton />
      </Page>
    );
  }

  const hasSession = sessionState.status === "active";
  const isLoadingSession = sessionState.status === "loading";

  return (
    <Page
      title={COPY.pageTitle}
      description="Contribute to Imprint! Let's make our streets accessible for all."
      contribute
    >
      {/* The top of the page (17 Oct 2026, apple-design pass). The greeting
          on the left, the actions on the right, one filled button among them.
          Each link wraps its Button with
          tabIndex={-1}, as on the home page, so Tab stops once per action. */}
      <section className="pt-12 pb-12 lg:pt-16">
        <Container className="relative z-10">
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-muted">{hasCompletedDemo ? COPY.welcomeBack : COPY.welcome}</p>
              <h1 className="mt-1 font-display text-5xl lg:text-6xl font-extrabold tracking-[-0.03em] leading-[1.04] text-primary break-words">
                {username}.
              </h1>
              {userRole === "annotator" && (
                <div className="mt-3">
                  <Badge tone="success">{COPY.annotatorBadge}</Badge>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
              {isTutorialSession ? (
                <>
                  <Link href="/contribute/tutorial" tabIndex={-1} className="flex">
                    <Button fullWidth>{COPY.resumeTutorial}</Button>
                  </Link>
                  {/* Nothing in the tutorial is saved, so it stops without asking */}
                  <Button
                    variant="neutral"
                    onClick={() => {
                      clearSession();
                      setIsTutorialSession(false);
                    }}
                  >
                    {COPY.stopTutorial}
                  </Button>
                </>
              ) : !hasSession ? (
                <>
                  {!hasCompletedDemo ? (
                    <Link
                      href={isLoadingSession ? "" : "/contribute/tutorial"}
                      tabIndex={-1}
                      className={`flex ${isLoadingSession ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <Button fullWidth>{isLoadingSession ? COPY.loading : COPY.startTutorial}</Button>
                    </Link>
                  ) : user.isProfileIncomplete ? (
                    <Link href="/complete-profile" tabIndex={-1} className="flex">
                      <Button fullWidth>{COPY.completeProfile}</Button>
                    </Link>
                  ) : (
                    <Link
                      href={isLoadingSession ? "" : "/contribute/annotate"}
                      tabIndex={-1}
                      className={`flex ${isLoadingSession ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <Button fullWidth>{isLoadingSession ? COPY.loading : COPY.annotate}</Button>
                    </Link>
                  )}

                  {hasCompletedDemo && (
                    <Link href="/contribute/tutorial" tabIndex={-1} className="flex">
                      <Button variant="neutral" fullWidth>{COPY.replayTutorial}</Button>
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <Link href="/contribute/annotate" tabIndex={-1} className="flex">
                    <Button fullWidth>{COPY.resumeSession}</Button>
                  </Link>
                  {/* Stopping ends the session, so it asks first, as the
                      annotation screen does (17 Oct 2026). It used to stop on
                      the first click. */}
                  <Button variant="neutral" onClick={() => setConfirmStop(true)}>
                    {COPY.stopSession}
                  </Button>
                </>
              )}
            </div>
          </div>
        </Container>
      </section>
      {/* The lower dashboard (Recent sessions, Your progress), for both roles.
          Annotators saw none of it from 6 Oct 2026; it is back for them from
          21 Oct 2026, Recent sessions included. */}
      <DashboardInfo username={username} userId={userId} />
      <ConfirmDialog
        open={confirmStop}
        title={COPY.stopDialog.title}
        description={COPY.stopDialog.description}
        confirmLabel={COPY.stopDialog.confirm}
        destructive
        onCancel={() => setConfirmStop(false)}
        onConfirm={async () => {
          setConfirmStop(false);
          try {
            await fetch("/api/annotationAbandon", { method: "POST" });
            clearSession();
            // A full reload, as the session's row does, so the totals below re-read
            window.location.reload();
          } catch (e) {
            console.error(e);
          }
        }}
      />
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