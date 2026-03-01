/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { getSession, useSession } from "next-auth/react";

import { H2, H3, P } from "@/ui/Typography";
import Confetti from "react-confetti";
import { useWindowSize } from "react-use";

export default function AnnotationDone({ data, total }) {
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const { width, height } = useWindowSize();

  if (typeof window !== "undefined" && loading) return null;

  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    window.localStorage.setItem("annotationTotalCount", null);
    window.localStorage.setItem("annotationCurrentCount", null);
    window.localStorage.setItem("annotationSetData", null);

    async function completeSession() {
      await fetch("/api/annotationComplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total: total
        }),
      });
    }
    completeSession();
  }, [session, total]);

  const annotationData = data;
  const router = useRouter();

  const baseButton = "transition-all duration-500 ease-in-out font-semibold py-2 px-4 rounded border hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <>
      <Confetti
        width={width}
        height={height}
        recycle={false}    // stops spawning new confetti after initial burst
        numberOfPieces={500}
        gravity={0.15}     // slightly slower fall for better effect
      />
      <section className="container px-5 mx-auto flex flex-col items-center justify-center min-h-[70vh] py-12">

        {/* Main Hero Section */}
        <div className="text-center mb-10 max-w-2xl">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6 shadow-sm">
            <span className="text-4xl">🎉</span>
          </div>
          <h1 className="text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">
            Incredible work{session?.user?.username ? `, ${session.user.username}` : ""}!
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            You successfully completed a batch of <strong className="text-[#004aad]">{total} annotation{total === 1 ? '' : 's'}</strong>.
          </p>
          <p className="text-md text-gray-500">
            Every image you map brings us one step closer to truly accessible cities for everyone.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col items-center gap-4 w-full max-w-sm mb-16">
          <button
            onClick={() => router.reload(window.location.pathname)}
            className={`${baseButton} w-full bg-primary border-primary text-white hover:brightness-110 shadow-[0_4px_14px_0_rgba(0,74,173,0.39)] py-4 text-lg`}
          >
            Start Another Session
          </button>
          <Link href="/contribute" className="w-full flex">
            <button className={`${baseButton} w-full border-gray-300 text-gray-700 bg-white hover:bg-gray-50 py-3 text-lg`}>
              Return to Dashboard
            </button>
          </Link>
        </div>

        {/* Image Gallery */}
        <div className="w-full max-w-5xl bg-white border border-gray-100 rounded-2xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
            <H3 className="text-gray-800 m-0">Annotated Images</H3>
            <span className="bg-[#004aad]/10 text-[#004aad] font-semibold py-1 px-3 rounded-full text-sm">
              {data?.imgRecords?.length || 0} Total
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {annotationData?.imgRecords?.map((image, index) => (
              <div
                key={image._id}
                className="relative aspect-square overflow-hidden rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 group"
              >
                <img
                  src={image.url}
                  alt={`Annotated image ${index + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

AnnotationDone.getInitialProps = async (context) => {
  const session = await getSession(context);
  return {
    session,
  };
};
