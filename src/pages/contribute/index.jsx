import React, { useEffect, useState } from "react";
import Link from "next/link";
import { getSession, useSession } from "next-auth/react";
import { connectToDatabase } from "@/util/mongodb";
import { ObjectId } from "mongodb";

import Page from "@/ui/page";

import DashboardInfo from "../../features/contribute/dashboard/infoSection";

const FUN_FACTS = [
  "Did you know? Under Philippine Law (BP 344), an accessible wheelchair ramp must have a maximum slope of 1:12 to be safe.",
  "According to the WHO, an estimated 1.3 billion people—or 16% of the global population—experience a significant disability.",
  "Tactile paving (the textured ground on sidewalks) was invented by Seiichi Miyake in Japan in 1965 to help visually impaired pedestrians.",
  "The international standard for a safe wheelchair turning space is a minimum of 1.5 meters (1500mm) in diameter.",
  "Walkable cities naturally lower local temperatures. Trees along mapped sidewalks can reduce surface heat by up to 10-20°C.",
  "In a recent global index, Metro Manila was ranked among the least walkable cities—making your mapping efforts incredibly important!",
  "A standard wheelchair requires a minimum clear width of 0.9 meters just to move forward safely.",
  "Over 50% of the world's population lives in cities today, making urban accessibility a top priority for the United Nations."
];

export default function ContributePage({ session }) {
  const { data: clientSession, status } = useSession();
  const loading = status === "loading";

  const [sessionState, setSessionState] = useState({
    status: "loading", // "loading" | "active" | "none"
    current: 0,
    total: 0,
  });
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [randomFact, setRandomFact] = useState("");

  // Prioritize the server-side session because it contains our live DB stats
  const activeSession = session || clientSession;
  const username = activeSession?.user?.username || "";
  const userId = activeSession?.user?._id || "";

  useEffect(() => {
    // Pick a random fact on the client side to avoid Next.js hydration errors
    const randomIndex = Math.floor(Math.random() * FUN_FACTS.length);
    setRandomFact(FUN_FACTS[randomIndex]);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      setSessionState({ status: "none", current: 0, total: 0 });
      return;
    }

    if (status !== "authenticated") return;

    if (activeSession?.user?.isNewGoogleUser) {
      window.location.replace("/choose-username");
      return;
    }

    if (!username) return;

    const checkSession = async () => {
      // 1. Check local storage first
      const localTotal = parseInt(localStorage.getItem("annotationTotalCount"));
      const localCurrent = parseInt(localStorage.getItem("annotationCurrentCount"));

      if (localTotal && localCurrent) {
        setSessionState({
          status: "active",
          current: localCurrent,
          total: localTotal,
        });
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

  if (typeof window !== "undefined" && loading) return null;

  const handleRestart = async () => {
    // Clear local cache
    localStorage.removeItem("annotationCurrentCount");
    localStorage.removeItem("annotationTotalCount");
    localStorage.removeItem("annotationSetData");

    // Attempt to close out server session so it doesn't hang
    await fetch("/api/annotationAbandon", { method: "POST" });

    // Update state to reflect session is closed
    setSessionState({ status: "none", current: 0, total: 0 });

    // Trigger a refresh of the DashboardInfo profile stats
    setRefreshCounter((prev) => prev + 1);

    // Force a full page reload to guarantee getServerSideProps fetches the updated totalAnnotations
    window.location.reload();
  };

  const baseButton =
    "transition-all duration-500 ease-in-out font-semibold py-3 px-8 text-lg rounded-[2rem] border hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none";

  const hasSession = sessionState.status === "active";
  const isLoadingSession = sessionState.status === "loading";

  return (
    <Page
      title="Dashboard - Imprint Contribute"
      description="Contribute to Imprint! Let's make our streets accessible for all."
      contribute
    >
      <section className="pt-12 pb-8 border-b border-gray-100">
        <div className="container mx-auto px-5 lg:max-w-7xl lg:w-4/5 relative z-10">

          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">

            {/* Left Side: Welcome Text */}
            <div className="w-full md:w-auto">
              <p className="text-gray-500 font-semibold text-lg mb-1">Welcome back,</p>
              <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#004aad] to-indigo-500">{username}.</span>
              </h1>
            </div>

            {/* Right Side: The Action Buttons */}
            <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4 w-full md:w-auto">
              {hasSession && (
                <button
                  onClick={handleRestart}
                  disabled={isLoadingSession}
                  className={`${baseButton} flex-1 md:flex-none border-gray-200 text-accent hover:border-accent bg-white`}
                >
                  Stop Session
                </button>
              )}

              {activeSession?.user?.isProfileIncomplete && activeSession?.user?.totalAnnotations > 0 ? (
                <div className="flex-1 md:flex-none flex relative group cursor-not-allowed">
                  <button
                    disabled
                    className={`${baseButton} w-full bg-gray-400 border-gray-400 text-white opacity-70 pointer-events-none`}
                  >
                    Start Annotating
                  </button>
                  {/* Custom Tooltip */}
                  <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gray-800 text-white text-sm font-semibold rounded py-2 px-4 whitespace-nowrap pointer-events-none z-50 shadow-xl">
                    Complete your profile to continue mapping
                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-gray-800 rotate-45"></div>
                  </div>
                </div>
              ) : (
                <Link href="/contribute/annotate" className="flex-1 md:flex-none flex">
                  <button
                    disabled={isLoadingSession}
                    className={`${baseButton} w-full bg-primary border-primary text-white hover:bg-opacity-90`}
                  >
                    {isLoadingSession
                      ? "Loading..."
                      : hasSession
                        ? `Resume Annotation (${sessionState.current - 1}/${sessionState.total})`
                        : "Start Annotating"}
                  </button>
                </Link>
              )}
            </div>
          </div>

        </div>
      </section>
      <DashboardInfo username={username} userId={userId} refreshCounter={refreshCounter} randomFact={randomFact} />
    </Page>
  );
}

export async function getServerSideProps(context) {
  const session = await getSession(context);
  
  if (!session || !session.user?._id) {
    return { props: { session } };
  }

  try {
    const { db } = await connectToDatabase();
    const dbUser = await db.collection("users").findOne({ _id: new ObjectId(session.user._id) });

    if (dbUser) {
      // Inject the true, live values into the session object passed to the frontend
      session.user.totalAnnotations = dbUser.totalAnnotations || 0;
      
      // If they completed their profile on another device or tab, reflect it instantly
      if (dbUser.age) {
        session.user.isProfileIncomplete = false;
      }
    }
  } catch (error) {
    console.error("Failed to fetch live user stats in dashboard getServerSideProps:", error);
  }

  return { props: { session } };
}