import Link from "next/link";
import HXIL from "@/ui/logo/hxil";
import { Container } from "@/ui";
import {
  FOOTER_COPY as COPY,
  STUDY_LINKS,
  RESEARCHER_EMAIL,
  REPOSITORY_URL,
  LAB_URL,
} from "./footerCopy";

/**
 * The site footer, on every page that shows the navbar.
 *
 * Redesigned 16 Oct 2026 (apple-design, IMPRINT_public_redesign.md), and
 * realigned the same evening on one centre line like the old footer (Rans:
 * the first version looked uneven). Centred: the old footer's thank-you and
 * invitation (Rans: they made it feel human) with Email and GitHub. Imprint's
 * name and tagline and the photo credit line were taken out on 17 Oct 2026
 * (Rans). Each photo is credited where it is annotated (PhotoCredit). Below a
 * hairline, the old footer's bottom row: the lab's logo on the left, the
 * copyright in the middle, the site's pages on the right. On a phone the row
 * stacks, centred.
 *
 * Back on the old footer's dark `accent` ground with white text and the old
 * white outlined Email and GitHub buttons on 17 Oct 2026 (Rans: the light
 * footer looked bad). The lab's logo is drawn in cream for this ground.
 *
 * The year is fixed at build time rather than read from the clock, so the
 * server's HTML and the browser's first render always agree.
 */
const YEAR = 2026;

const linkClass =
  "text-white hover:underline rounded-control focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

// Email and GitHub keep the old footer's two outlined buttons and their icons,
// in its white outline that fills on hover. Links, not <Button>s: they go somewhere.
const pillClass =
  "inline-flex items-center gap-2 rounded-control border border-white bg-transparent px-3 py-1.5 text-sm font-semibold text-white hover:border-transparent hover:bg-white hover:text-ink transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

export default function Footer() {
  return (
    <footer className="relative z-10 w-full bg-accent text-sm">
      <Container className="py-12 lg:py-16">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <p className="font-display text-2xl font-bold leading-tight tracking-[-0.015em] text-white text-balance">{COPY.thanks}</p>
          <p className="mt-2 text-subtle text-balance">{COPY.invite}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <a href={`mailto:${RESEARCHER_EMAIL}`} className={pillClass}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 512 512" fill="currentColor">
                <path d="M467 80.609H45c-24.813 0-45 20.187-45 45v260.782c0 24.813 20.187 45 45 45h422c24.813 0 45-20.187 45-45V125.609c0-24.813-20.187-45-45-45zm-5.873 30l-6.006 5.001-181.267 150.941c-10.346 8.614-25.364 8.614-35.708 0L56.879 115.61l-6.006-5.001h410.254zM30 132.267L177.692 255.25 30 353.543V132.267zm437 269.124H45c-7.248 0-13.31-5.168-14.699-12.011l171.445-114.101 17.204 14.326a57.79 57.79 0 0037.051 13.407 57.793 57.793 0 0037.051-13.407l17.204-14.326 171.444 114.1c-1.39 6.845-7.452 12.012-14.7 12.012zm15-47.848l-147.692-98.292L482 132.267v221.276z" />
              </svg>
              {COPY.emailLabel}
            </a>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" className={pillClass}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 256 250" fill="currentColor">
                <path d="M128.001 0C57.317 0 0 57.307 0 128.001c0 56.554 36.676 104.535 87.535 121.46 6.397 1.185 8.746-2.777 8.746-6.158 0-3.052-.12-13.135-.174-23.83-35.61 7.742-43.124-15.103-43.124-15.103-5.823-14.795-14.213-18.73-14.213-18.73-11.613-7.944.876-7.78.876-7.78 12.853.902 19.621 13.19 19.621 13.19 11.417 19.568 29.945 13.911 37.249 10.64 1.149-8.272 4.466-13.92 8.127-17.116-28.431-3.236-58.318-14.212-58.318-63.258 0-13.975 5-25.394 13.188-34.358-1.329-3.224-5.71-16.242 1.24-33.874 0 0 10.749-3.44 35.21 13.121 10.21-2.836 21.16-4.258 32.038-4.307 10.878.049 21.837 1.47 32.066 4.307 24.431-16.56 35.165-13.12 35.165-13.12 6.967 17.63 2.584 30.65 1.255 33.873 8.207 8.964 13.173 20.383 13.173 34.358 0 49.163-29.944 59.988-58.447 63.157 4.591 3.972 8.682 11.762 8.682 23.704 0 17.126-.148 30.91-.148 35.126 0 3.407 2.304 7.398 8.792 6.14C219.37 232.5 256 184.537 256 128.002 256 57.307 198.691 0 128.001 0zm-80.06 182.34c-.282.636-1.283.827-2.194.39-.929-.417-1.45-1.284-1.15-1.922.276-.655 1.279-.838 2.205-.399.93.418 1.46 1.293 1.139 1.931zm6.296 5.618c-.61.566-1.804.303-2.614-.591-.837-.892-.994-2.086-.375-2.66.63-.566 1.787-.301 2.626.591.838.903 1 2.088.363 2.66zm4.32 7.188c-.785.545-2.067.034-2.86-1.104-.784-1.138-.784-2.503.017-3.05.795-.547 2.058-.055 2.861 1.075.782 1.157.782 2.522-.019 3.08zm7.304 8.325c-.701.774-2.196.566-3.29-.49-1.119-1.032-1.43-2.496-.726-3.27.71-.776 2.213-.558 3.315.49 1.11 1.03 1.45 2.505.701 3.27zm9.442 2.81c-.31 1.003-1.75 1.459-3.199 1.033-1.448-.439-2.395-1.613-2.103-2.626.301-1.01 1.747-1.484 3.207-1.028 1.446.436 2.396 1.602 2.095 2.622zm10.744 1.193c.036 1.055-1.193 1.93-2.715 1.95-1.53.034-2.769-.82-2.786-1.86 0-1.065 1.202-1.932 2.733-1.958 1.522-.03 2.768.818 2.768 1.868zm10.555-.405c.182 1.03-.875 2.088-2.387 2.37-1.485.271-2.861-.365-3.05-1.386-.184-1.056.893-2.114 2.376-2.387 1.514-.263 2.868.356 3.061 1.403z" />
              </svg>
              {COPY.sourceLabel}
            </a>
          </div>
        </div>

        <div className="mt-10 grid items-center justify-items-center gap-5 border-t border-white/15 pt-6 sm:grid-cols-[1fr_auto_1fr] sm:justify-items-stretch">
          <a href={LAB_URL} target="_blank" rel="noreferrer" aria-label={COPY.labLabel} className="order-2 justify-self-center rounded-control focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:order-none sm:justify-self-start">
            <HXIL height={32} />
          </a>
          <p className="order-3 text-white sm:order-none">{COPY.copyright(YEAR)}</p>
          <nav aria-label={COPY.linksLabel} className="order-1 sm:order-none sm:justify-self-end">
            <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2">
              {STUDY_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </Container>
    </footer>
  );
}
