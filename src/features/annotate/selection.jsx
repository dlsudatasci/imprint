import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { writeSession, writeTutorialFlag } from "@/util/sessionCache";
import { CONTRIBUTOR_OPTIONS, sessionOptionsFor } from "./sessionOptions";
import SessionSizeOptions, { SESSION_PICKER_COPY as COPY } from "./SessionSizeOptions";
import { EMAIL_NOT_VERIFIED_CODE } from "@/util/validators/emailVerification.mjs";

import { Button, Card, Container } from "@/ui";

// The sizes on offer come from /api/annotationGet (sessionSizes), which knows
// whether this person is an annotator (10, 25, 50) or a contributor (5, 10, 20,
// 40) and rejects any count not on their list.

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
 *
 * A contributor whose email address is not confirmed is refused by
 * /api/annotationGet (403, EMAIL_NOT_VERIFIED, S9) and sent to /check-email,
 * whether that comes from the first check or from Start.
 */
export default function AnnotationSessionSelection() {
  const router = useRouter();
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [poolExhausted, setPoolExhausted] = useState(false);
  const [options, setOptions] = useState(CONTRIBUTOR_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/annotationGet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(async (r) => {
        if (r.ok) return r.json();
        const refusal = await r.json().catch(() => null);
        if (!cancelled && r.status === 403 && refusal?.code === EMAIL_NOT_VERIFIED_CODE) router.replace("/check-email");
        return null;
      })
      .then((json) => {
        if (cancelled || !json || !Array.isArray(json.sessionSizes)) return;
        const annotator = json.sessionSizes.join() !== CONTRIBUTOR_OPTIONS.map((o) => o.count).join();
        setOptions(sessionOptionsFor(json.sessionSizes, { annotator }));
        setSelected((prev) => (json.sessionSizes.includes(prev) ? prev : null));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

      if (annotationResponse.status === 403 && annotationJson?.code === EMAIL_NOT_VERIFIED_CODE) {
        router.replace("/check-email");
        return;
      }

      if (!annotationResponse.ok) {
        console.error("Failed to start session:", annotationJson);
        alert(annotationJson.message || "Failed to start session. Please try again.");
        setLoading(false);
        return;
      }

      if (annotationJson.poolExhausted) {
        setPoolExhausted(true);
        setLoading(false);
        return;
      }

      // The session's length is the images actually served, which can be fewer
      // than chosen when the pool runs short, as a resume already counts it.
      // Recording the size chosen made the last position point past the end.
      writeSession({ total: annotationJson.imgRecords.length, current: 1, data: annotationJson });
      // A real session, over the tutorial's practice photos if they were there (23 Oct 2026)
      writeTutorialFlag(false);

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
            {poolExhausted ? (
              <>
                <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
                  All images annotated
                </h2>
                <p className="mt-3 text-muted font-medium leading-relaxed mx-auto max-w-lg">
                  You have annotated every available image. Thank you for your
                  incredible contributions! We will notify you when more images
                  become available.
                </p>
                <div className="mt-10">
                  <Link href="/contribute" tabIndex={-1} className="inline-flex">
                    <Button>Return to Dashboard</Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
                  {COPY.title}
                </h2>
                <p className="mt-3 text-muted font-medium leading-relaxed mx-auto">
                  {COPY.lead}
                </p>

                <hr className="my-6 border-line-card" />

                <SessionSizeOptions options={options} selected={selected} onSelect={setSelected} disabled={loading} />

                {/* Action Buttons */}
                {/* Start Session above Cancel on a phone, Cancel first from 640 px (28 Oct 2026) */}
                <div className="flex flex-col-reverse sm:flex-row justify-center gap-4 mt-10">
                  {/* tabIndex -1: Tab stops on the Button, not the link and the Button (17 Oct 2026) */}
                  <Link
                    href={loading ? "" : "/contribute"}
                    tabIndex={-1}
                    className={`flex-1 sm:flex-none flex ${loading ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <Button variant="neutral" fullWidth>{COPY.cancel}</Button>
                  </Link>
                  <Button
                    className="flex-1 sm:flex-none"
                    onClick={startSession}
                    disabled={!selected || loading}
                  >
                    {loading ? COPY.starting : COPY.start}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      </section>
    </Container>
  );
}
