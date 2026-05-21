import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

const SESSION_OPTIONS = [
  { count: 5, label: "05", time: "2-3 minutes" },
  { count: 10, label: "10", time: "4-7 minutes" },
  { count: 20, label: "20", time: "8-10 minutes" },
  { count: 40, label: "40", time: "12-15 minutes" },
];

export default function AnnotationSessionSelection() {
  const router = useRouter();
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const startSession = async () => {
    if (!selected) return;
    setLoading(true);

    const requestBody = {
      annotationTotalCount: selected,
    };

    try {
      const annotationResponse = await fetch("/api/annotationGet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const annotationJson = await annotationResponse.json();

      if (!annotationResponse.ok) {
        console.error("Failed to start session:", annotationJson);
        alert(annotationJson.message || "Failed to start session. Please try again.");
        setLoading(false);
        return;
      }

      window.localStorage.setItem(
        "annotationTotalCount",
        JSON.stringify(selected)
      );
      window.localStorage.setItem("annotationCurrentCount", JSON.stringify(1));
      window.localStorage.setItem(
        "annotationSetData",
        JSON.stringify(annotationJson)
      );

      window.sessionStorage.setItem("isNavigatingImages", "true");
      router.reload();
    } catch (err) {
      console.error("Session start error:", err);
      alert("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const baseButton =
    "transition-all duration-500 ease-in-out font-semibold py-3 px-8 text-lg rounded-[2rem] border hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none";

  return (
    <section className="container px-5 mx-auto">
      <section className="pb-12 mt-12">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_4px_40px_rgb(0,0,0,0.06)] px-8 sm:px-12 py-10 my-5 mb-32 relative overflow-hidden">

          {/* Subtle decorative gradient */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-50 to-transparent rounded-full blur-3xl opacity-60 -translate-y-1/2 translate-x-1/3 pointer-events-none" />

          <div className="relative z-10 text-center">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              How many images would you like to annotate?
            </h2>
            <p className="mt-3 text-gray-500 font-medium leading-relaxed mx-auto">
              Each image takes about 30 seconds on average. You&apos;ll identify
              obstructions, rate sidewalk accessibility, and identify the surface type.
            </p>

            <hr className="my-6 border-gray-100" />

            {/* Selection Cards */}
            <div className="flex flex-wrap justify-center gap-5 mt-2">
              {SESSION_OPTIONS.map((option) => {
                const isSelected = selected === option.count;
                return (
                  <button
                    key={option.count}
                    onClick={() => setSelected(option.count)}
                    disabled={loading}
                    className={`
                      group flex flex-col items-center justify-center
                      w-28 sm:w-32 py-6 rounded-2xl border-2
                      transition-all duration-300 cursor-pointer
                      ${isSelected
                        ? "border-primary shadow-[0_4px_20px_-4px_rgba(0,74,173,0.25)]"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                      }
                      disabled:cursor-not-allowed
                    `}
                  >
                    <span className={`text-4xl sm:text-5xl font-black tracking-tight transition-colors duration-300 ${isSelected ? "text-primary" : "text-gray-800 group-hover:text-gray-900"}`}>
                      {option.label}
                    </span>
                    <span className={`text-sm font-semibold mt-2 transition-colors duration-300 ${isSelected ? "text-primary/70" : "text-gray-400"}`}>
                      {option.time}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-center gap-4 mt-10">
              <Link
                href={loading ? "" : "/contribute"}
                className={`flex-1 sm:flex-none flex justify-center items-center ${baseButton} w-full sm:w-auto border-gray-200 text-accent hover:border-accent bg-white ${
                  loading ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                Cancel
              </Link>
              <button
                onClick={startSession}
                disabled={!selected || loading}
                className={`${baseButton} flex-1 sm:flex-none bg-primary border-primary text-white hover:bg-opacity-90`}
              >
                {loading ? "Starting..." : "Start Session"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
