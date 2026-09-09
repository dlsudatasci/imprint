/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";

import { H1, H3, Button, Card, Badge, Container } from "@/ui";
import Confetti from "react-confetti";
import { useWindowSize } from "react-use";
import { getCrossedMilestone } from "@/util/milestones";
import { clearSession } from "@/util/sessionCache";

/**
 * The screen shown after a contributor finishes their batch.
 *
 * It also finalises the session: rendering it calls /api/annotationComplete,
 * which turns the pending annotations into saved ones. Reaching this screen is
 * therefore the point at which the work is committed, not just a thank-you.
 */
export default function AnnotationDone({ data, total }) {
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const { width, height } = useWindowSize();
  const [crossedMilestone, setCrossedMilestone] = React.useState(null);
  const [commitFailed, setCommitFailed] = React.useState(false);
  const initialized = useRef(false);
  const router = useRouter();

  useEffect(() => {
    // Guard against a second run. This effect finalizes the session and
    // increments the user's total, so firing twice would double-count it —
    // and React 18 StrictMode runs effects twice in development by design.
    // A ref rather than state because it must not trigger a re-render.
    if (initialized.current) return;
    initialized.current = true;

    // The batch is finished — drop the local mirror so the next visit starts
    // at the session-size picker rather than replaying this one
    clearSession();

    async function completeSession() {
      try {
        const res = await fetch("/api/annotationComplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            total: total
          }),
        });

        if (!res.ok) {
          setCommitFailed(true);
          return;
        }

        // The server returns the before and after totals so we can tell whether
        // this batch crossed a milestone — the client can't work that out alone,
        // since the running total lives in the database
        const payload = await res.json();
        if (payload.previousTotal !== undefined && payload.newTotal !== undefined) {
          const milestone = getCrossedMilestone(payload.previousTotal, payload.newTotal);
          if (milestone) {
            setCrossedMilestone(milestone);
          }
        }
      } catch (err) {
        // This request is the commit: it promotes the batch's pending
        // annotations. Losing it silently is the worst failure this screen has,
        // because the page still says "Incredible work" while nothing was
        // finalised. Say so instead.
        console.error("Failed to finalise session:", err);
        setCommitFailed(true);
      }
    }
    completeSession();
  }, [session, total]);

  // No `typeof window` branch here: rendering different trees on the server and
  // on the client is precisely what breaks hydration. `loading` is true on both
  // for the first render, so gating on it alone is consistent.
  if (loading) return null;

  const annotationData = data;

  return (
    <>
      <Confetti
        width={width}
        height={height}
        recycle={false}
        numberOfPieces={commitFailed ? 0 : crossedMilestone ? 1200 : 500}
        gravity={0.15}
      />
      <Container as="section" className="flex flex-col items-center justify-center min-h-[70vh] py-12">

        {/* The commit failed. Say so plainly and say what it means: the work
            is still on the server as an unfinished session, so resuming picks
            it up. Silence here would leave someone believing they were done. */}
        {commitFailed && (
          <div
            role="alert"
            className="w-full max-w-2xl mb-8 bg-danger-soft border border-danger-border text-danger rounded-card px-6 py-4 text-center"
          >
            <p className="font-bold mb-1">We couldn&apos;t finish saving this session.</p>
            <p className="text-sm">
              Your annotations are still on the server. Reload this page to pick up
              where you left off — nothing has been lost.
            </p>
          </div>
        )}

        {/* Main Hero Section */}
        <div className="text-center mb-10 max-w-2xl">
          <H1 className="mb-4">
            Incredible work{session?.user?.username ? `, ${session.user.username}` : ""}!
          </H1>
          <p className="text-xl text-body mb-2">
            You successfully completed a batch of <strong className="text-primary">{total} annotation{total === 1 ? '' : 's'}</strong>.
          </p>
          <p className="text-base text-muted">
            Every image you map brings us one step closer to truly accessible cities for everyone.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col items-center gap-4 w-full max-w-sm mb-16">
          {session?.user?.isProfileIncomplete ? (
            <Link href="/complete-profile" className="w-full flex">
              <Button fullWidth>Complete Profile to Continue</Button>
            </Link>
          ) : (
            <Button fullWidth onClick={() => router.reload(window.location.pathname)}>
              Start Another Session
            </Button>
          )}
          <Link href="/contribute" className="w-full flex">
            <Button variant="neutral" fullWidth>Return to Dashboard</Button>
          </Link>

          {crossedMilestone && (
            <div className="mt-8 w-full">
              <div className="border-2 border-primary rounded-card px-6 py-5 text-center bg-surface">
                <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-2">
                  New milestone
                </p>
                <p className="text-body font-medium">
                  Your annotations now cover the same distance as{' '}
                  <span className="text-ink font-bold">{crossedMilestone.name}</span>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Image Gallery */}
        <Card padding="lg" className="w-full max-w-5xl">
          <div className="flex items-center justify-between mb-6 border-b border-line-card pb-4">
            <H3 className="m-0">Annotated Images</H3>
            <Badge tone="info">{data?.imgRecords?.length || 0} Total</Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {annotationData?.imgRecords?.map((image, index) => (
              <div
                key={image._id}
                className="relative aspect-square overflow-hidden rounded-control border border-line"
              >
                <img
                  src={image.url}
                  alt={`Annotated image ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </Card>
      </Container>
    </>
  );
}

