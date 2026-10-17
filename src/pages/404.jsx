import Link from "next/link";
import Page from "@/ui/page";
import { Button, Container, Display, P } from "@/ui";
import { NOT_FOUND_COPY as COPY } from "@/features/notFound/notFoundCopy";

/**
 * The page for an address that does not exist (16 Oct 2026). Until then
 * Next.js showed its own bare "404 | This page could not be found." with no
 * navbar and no way back (apple-design, wayfinding). Static, so Next.js
 * builds it once.
 */
export default function NotFound() {
  return (
    <Page title="Page not found - Imprint" description={COPY.text} contribute={false}>
      <Container as="section" width="reading" className="py-24 text-center lg:py-32">
        <p className="text-sm font-semibold text-primary tabular-nums">{COPY.code}</p>
        <Display className="mt-3">{COPY.title}</Display>
        <P className="mx-auto mt-5 max-w-md text-base md:text-lg">{COPY.text}</P>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" tabIndex={-1}>
            <Button>{COPY.home}</Button>
          </Link>
          <Link href="/demo" tabIndex={-1}>
            <Button variant="neutral">{COPY.guide}</Button>
          </Link>
        </div>
      </Container>
    </Page>
  );
}
