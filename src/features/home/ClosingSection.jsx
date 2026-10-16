import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button, Container, H2, P } from "@/ui";
import { CLOSING_COPY as COPY } from "./closingCopy";

/**
 * The end of the landing page, after the task preview: the way in.
 *
 * One plain card (Rans, 15 Oct 2026, replacing the "Sidewalk conditions in
 * Metro Manila" and "What your work goes toward" sections that sat here): the
 * heading and its line, and the button beside them on a laptop, under them on
 * a phone. Border-led, no shadow (design system D6), nothing else.
 *
 * The button reads Start volunteering for visitors and Go to your dashboard
 * for anyone signed in. Nothing shows while the session is still loading, so
 * a signed-in visitor never sees the sign-up button flash.
 */
export default function ClosingSection() {
  const { status } = useSession();
  const cta = status === "authenticated" ? COPY.ctaSignedIn : status === "unauthenticated" ? COPY.ctaSignedOut : null;

  return (
    <Container as="section" aria-labelledby="join-title" className="pt-16 pb-20 lg:pt-24 lg:pb-28">
      <div className="flex flex-col gap-8 rounded-modal border border-line bg-surface px-6 py-10 sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:px-14 lg:py-12">
        <div className="max-w-xl">
          <H2 className="tracking-tight lg:text-4xl">
            <span id="join-title">{COPY.joinTitle}</span>
          </H2>
          <P className="mt-3">{COPY.joinText}</P>
        </div>
        <div className="min-h-[3.25rem] shrink-0">
          {cta && (
            <Link href="/contribute">
              <Button>{cta}</Button>
            </Link>
          )}
        </div>
      </div>
    </Container>
  );
}
