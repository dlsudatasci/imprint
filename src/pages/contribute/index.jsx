import React, { useEffect, useState } from "react";
import Link from "next/link";
import { getSession } from "next-auth/react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import Page from "@/ui/page";
import { H1 } from "@/ui/Typography";
import { H2 } from "@/ui/Typography";

import DashboardInfo from "../../features/contribute/dashboard/infoSection";

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

    // Redirect to start fresh
    router.push("/contribute/annotate");
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
      <section className="container flex flex-col pb-24 mx-auto px-5">
        <div className="lg:max-w-7xl lg:w-4/5 lg:mx-auto">
          <H1>Contribute to Imprint</H1>
          <div className="flex flex-col pt-8 md:flex-row justify-between items-center md:items-start">
            <H2>{username}</H2>
            <div className="mt-4 md:mt-2 flex space-x-4">
              {hasSession && (
                <button
                  onClick={handleRestart}
                  disabled={isLoadingSession}
                  className={`${baseButton} text-accent hover:border-accent`}
                >
                  Restart Annotation
                </button>
              )}

              <Link href="/contribute/annotate">
                <button
                  disabled={isLoadingSession}
                  className={`${baseButton} bg-primary border-primary text-white hover:bg-opacity-90`}
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
      <DashboardInfo username={username} />
    </Page>
  );
}

export async function getServerSideProps(context) {
  const session = await getSession(context);
  return { props: { session } };
}
