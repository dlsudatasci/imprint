import React, { useEffect, useState } from "react";
import Link from "next/link";
import { getSession } from "next-auth/react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import Page from "@/ui/page";
import { H1 } from "@/ui/Typography";
import { H2 } from "@/ui/Typography";
import { Lightbulb } from "lucide-react";

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

  if (typeof window !== "undefined" && loading) return null;

  const activeSession = clientSession || session;
  const username = activeSession?.user?.username || "";
  const router = useRouter();

  const [sessionState, setSessionState] = useState({
    status: "loading", // "loading" | "active" | "none"
    current: 0,
    total: 0,
  });
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [randomFact, setRandomFact] = useState("");

  useEffect(() => {
    // Pick a random fact on the client side to avoid Next.js hydration errors
    const randomIndex = Math.floor(Math.random() * FUN_FACTS.length);
    setRandomFact(FUN_FACTS[randomIndex]);
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !username) {
      if (status === "unauthenticated") {
        setSessionState({ status: "none", current: 0, total: 0 });
      }
      return;
    }

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
          body: JSON.stringify({ username }),
        });
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
  };

  const baseButton =
    "transition-all duration-500 ease-in-out font-semibold py-2 px-4 rounded border hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none";

  const hasSession = sessionState.status === "active";
  const isLoadingSession = sessionState.status === "loading";

  return (
    <Page
      title="Dashboard - Imprint Contribute"
      description="Contribute to Imprint! Let's make our streets accessible for all."
      contribute
    >
      <section className="pt-10 pb-16 border-b-2 border-gray-200">
        <div className="container mx-auto px-5 lg:max-w-7xl lg:w-4/5">

          {/* Top Centered Fun Fact Pill (Removed max-w-4xl so it stretches naturally) */}
          {randomFact && (
            <div className="flex justify-center w-full mb-10">
              <div className="flex items-center gap-3 bg-amber-50/80 border border-amber-200/80 rounded-full py-2 px-5 text-sm font-medium text-amber-800 shadow-sm text-center">
                <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span>{randomFact}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">

            {/* Left Side: Welcome Text */}
            <div className="w-full md:w-auto">
              <p className="text-primary font-semibold mb-2 uppercase tracking-wide text-sm">Contributor Dashboard</p>
              <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Welcome back, {username}!</h1>
            </div>

            {/* Right Side: The Action Buttons */}
            <div className="flex space-x-4 w-full md:w-auto">
              {hasSession && (
                <button
                  onClick={handleRestart}
                  disabled={isLoadingSession}
                  className={`${baseButton} flex-1 md:flex-none border-gray-300 text-gray-700 bg-white hover:bg-gray-50`}
                >
                  Stop Session
                </button>
              )}

              <Link href="/contribute/annotate" className="flex-1 md:flex-none flex">
                <button
                  disabled={isLoadingSession}
                  className={`${baseButton} w-full bg-primary border-primary text-white hover:brightness-110 shadow-[0_4px_14px_0_rgba(0,74,173,0.39)]`}
                >
                  {isLoadingSession
                    ? "Loading..."
                    : hasSession
                      ? `Resume Annotation (${sessionState.current}/${sessionState.total})`
                      : "Start Annotating"}
                </button>
              </Link>
            </div>

          </div>
        </div>
      </section>
      <DashboardInfo username={username} refreshCounter={refreshCounter} />
    </Page>
  );
}

export async function getServerSideProps(context) {
  const session = await getSession(context);
  return { props: { session } };
}