import Link from "next/link";
import { useRouter } from "next/router";
import { Container, cn } from "@/ui";

/**
 * Shared layout for the Informed Consent and Privacy Policy pages.
 *
 * Both render through here so they stay a matched pair, with one control for
 * moving between them. Add any future legal page here too rather than giving it
 * a layout of its own.
 *
 * Redesigned 16 Oct 2026 (apple-design, IMPRINT_public_redesign.md): a plain
 * reading column on the page ground instead of a card, so the text is the
 * page. A segmented control switches between the two documents, the title
 * is the page's h1, and each section's heading is an h2 with space above it,
 * so the page reads as one document and its outline is real.
 */

export const LEGAL_TABS = Object.freeze([
  Object.freeze({ href: "/terms-of-use", label: "Informed Consent" }),
  Object.freeze({ href: "/privacy", label: "Privacy Policy" }),
]);

export function LegalShell({ title, intro, children }) {
  const router = useRouter();

  return (
    <Container as="article" width="reading" className="pt-10 pb-24 lg:pt-14">
      <nav aria-label="Legal documents" className="inline-flex rounded-full border border-line bg-surface-subtle p-1">
        {LEGAL_TABS.map((tab) => {
          const isCurrent = router.pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isCurrent ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-300",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                isCurrent ? "bg-surface text-ink border border-line" : "border border-transparent text-muted hover:text-ink",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <h1 className="mt-8 font-display text-4xl font-extrabold leading-[1.08] tracking-[-0.02em] text-ink sm:text-5xl">{title}</h1>
      <div className="mt-5 border-b border-line pb-10 text-lg leading-relaxed text-body">{intro}</div>

      <div className="mt-10 space-y-10 text-base leading-7 text-body">{children}</div>
    </Container>
  );
}

export function LegalSection({ title, children }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-2xl font-bold tracking-[-0.01em] text-ink">{title}</h2>
      {children}
    </section>
  );
}
