import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { writeSession } from "@/util/sessionCache";

import { Button, Card, Container } from "@/ui";

// Must stay in sync with ALLOWED_SESSION_SIZES in /api/annotationGet — that
// endpoint rejects any count not on its list.
const SESSION_OPTIONS = [
  { count: 5, label: "05", time: "2-3 minutes" },
  { count: 10, label: "10", time: "4-7 minutes" },
  { count: 20, label: "20", time: "8-10 minutes" },
  { count: 40, label: "40", time: "12-15 minutes" },
];

/**
 * The first screen of a new annotation session, asking how many images to take.
 *
 * Choosing a batch size up front gives contributors a finite target. "8 of 20"
 * is easier to finish than an open-ended queue, and it gives the progress bar
 * and the end-of-session screen something to count toward.
 *
 * Starting a session reloads the page rather than changing state in place, so
 * the annotate page picks the batch up from the session cache using the same
 * path as an ordinary visit.
 */
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

      writeSession({ total: selected, current: 1, data: annotationJson });

      window.sessionStorage.setItem("isNavigatingImages", "true");
      router.reload();
    } catch (err) {
      console.error("Session start error:", err);
      alert("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <Container as="section">
      <section className="pb-12 mt-12">
        <Card padding="none" className="px-8 sm:px-12 py-10 my-5 mb-32 relative overflow-hidden">

          <div className="relative z-10 text-center">
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              How many images would you like to annotate?
            </h2>
            <p className="mt-3 text-muted font-medium leading-relaxed mx-auto">
              Each image takes about 30 seconds on average. You&apos;ll identify
              obstructions, rate sidewalk accessibility, and identify the surface type.
            </p>

            <hr className="my-6 border-line-card" />

            {/* Selection Cards */}
            <div className="flex flex-wrap justify-center gap-5 mt-2">
              {SESSION_OPTIONS.map((option) => {
                const isSelected = selected === option.count;
                return (
                  // eslint-disable-next-line react/forbid-elements -- selectable card, not a Button variant: it carries its own selected state and sizing
                  <button
                    key={option.count}
                    onClick={() => setSelected(option.count)}
                    disabled={loading}
                    className={`
                      group flex flex-col items-center justify-center
                      w-28 sm:w-32 py-6 rounded-card border-2
                      transition-colors duration-300 cursor-pointer
                      ${isSelected
                        ? "border-primary bg-primary-50"
                        : "border-line bg-surface hover:border-subtle"
                      }
                      disabled:cursor-not-allowed
                    `}
                  >
                    <span className={`text-4xl sm:text-5xl font-extrabold tracking-tight transition-colors duration-300 ${isSelected ? "text-primary" : "text-body group-hover:text-ink"}`}>
                      {option.label}
                    </span>
                    <span className={`text-sm font-semibold mt-2 transition-colors duration-300 ${isSelected ? "text-primary/70" : "text-subtle"}`}>
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
                className={`flex-1 sm:flex-none flex ${loading ? "opacity-50 pointer-events-none" : ""}`}
              >
                <Button variant="neutral" fullWidth>Cancel</Button>
              </Link>
              <Button
                className="flex-1 sm:flex-none"
                onClick={startSession}
                disabled={!selected || loading}
              >
                {loading ? "Starting..." : "Start Session"}
              </Button>
            </div>
          </div>
        </Card>
      </section>
    </Container>
  );
}
