import Link from "next/link";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { Display, P, Button, Container } from "@/ui";
import { HERO_COPY as COPY } from "./heroCopy";

// ssr:false is required, not an optimization — Leaflet reaches for `window` at
// import time and throws during server rendering. The skeleton reserves the
// map's height so the rest of the page doesn't jump when it arrives.
const CityMap = dynamic(() => import("./CityMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] lg:h-[480px] bg-surface-subtle animate-pulse motion-reduce:animate-none flex items-center justify-center rounded-card border border-line">
      <p className="text-sm font-medium text-subtle">Loading map...</p>
    </div>
  ),
});

/**
 * The top of the landing page: what Imprint asks of a volunteer, the way in,
 * and the city map.
 *
 * Redesigned 16 Oct 2026 (IMPRINT_public_redesign.md): the welcome and its
 * line stay (heroCopy.js), the heading is display size with tracking that
 * tightens as it grows (apple-design), and there is one
 * filled button. Like the join card at the end of the page, that button reads
 * Start volunteering for visitors and Go to your dashboard for anyone signed
 * in, and shows nothing while the session is loading so the wrong one never
 * flashes. Its height is reserved, so nothing moves when it appears.
 */
export default function Hero({ selectedCity, onCitySelect }) {
  const { status } = useSession();
  const cta = status === "authenticated" ? COPY.ctaSignedIn : status === "unauthenticated" ? COPY.ctaSignedOut : null;

  return (
    <Container as="section" aria-labelledby="hero-title" className="flex flex-col items-center gap-10 pt-10 pb-12 lg:flex-row lg:items-center lg:gap-16 lg:pt-16 lg:pb-16">
      <div className="flex w-full max-w-xl flex-col lg:max-w-none lg:basis-[44%] lg:shrink-0">
        <Display id="hero-title">
          {COPY.titleLead} <span className="text-primary">{COPY.titleName}</span>
        </Display>
        <P className="mt-6 text-base leading-relaxed md:text-lg">{COPY.lead}</P>
        <div className="mt-8 flex min-h-[3.25rem] flex-wrap items-center gap-3">
          {cta && (
            <Link href="/contribute" tabIndex={-1}>
              <Button>{cta}</Button>
            </Link>
          )}
          <Link href="/about" tabIndex={-1}>
            <Button variant="neutral">{COPY.secondary}</Button>
          </Link>
        </div>
      </div>

      <div className="w-full lg:flex-1">
        <CityMap selectedCity={selectedCity} onCitySelect={onCitySelect} />
      </div>
    </Container>
  );
}
