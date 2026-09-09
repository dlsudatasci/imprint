import Link from "next/link";
import { useRouter } from "next/router";
import { Container } from "@/ui";

/**
 * Shared layout for the Terms of Use and Privacy Policy pages.
 *
 * Both render through here so they stay a matched pair, with one tab strip for
 * moving between them. Add any future legal page here too rather than giving it
 * a layout of its own.
 */

const TABS = [
  { href: "/terms-of-use", label: "Terms of Use" },
  { href: "/privacy", label: "Privacy Policy" },
];

export function LegalShell({ title, intro, children }) {
  const router = useRouter();

  return (
    <Container as="section" className="py-4 my-12 mb-32 flex flex-col items-center">
      <div className="w-full sm:w-11/12 lg:w-10/12 xl:w-9/12 bg-surface rounded-card border border-line p-8 sm:p-14">
        <nav className="flex gap-1 mb-10 border-b border-line" aria-label="Legal documents">
          {TABS.map((tab) => {
            const isCurrent = router.pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isCurrent ? "page" : undefined}
                className={`px-4 py-3 -mb-px border-b-2 text-sm font-semibold transition-colors duration-300 ${
                  isCurrent
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <h1 className="text-4xl font-extrabold text-ink tracking-tight mb-4">{title}</h1>
        <div className="text-lg text-body leading-relaxed mb-12 border-b border-line pb-10">
          {intro}
        </div>

        <div className="space-y-12 text-body leading-relaxed">{children}</div>
      </div>
    </Container>
  );
}

export function LegalSection({ title, children }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-ink mb-4">{title}</h2>
      {children}
    </div>
  );
}
