import { useState } from "react";
import Link from "next/link";
import { H2, P, Container, Card, Button } from "@/ui";

/**
 * Shown in place of the annotation tool on devices that can't run it.
 *
 * Drawing a box and dragging its handles both need a pointer that can hit a few
 * pixels, and the canvas has no touch equivalent. Boxes placed by thumb would
 * be imprecise, and imprecise annotations are worse for the dataset than none,
 * so phones and tablets are blocked outright.
 *
 * Since the real fix is to come back on a laptop, this screen hands over the
 * link to return to, and a way back to the dashboard.
 *
 * See hooks/useCanAnnotate for how a device is judged.
 */
export default function DesktopOnly() {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure origin, or permission refused). The URL is
      // in the address bar either way, so there's nothing to recover from.
    }
  };

  return (
    <Container as="section" className="py-12">
      <Card padding="lg" className="max-w-xl mx-auto">
        <H2>Annotating needs a bigger screen</H2>
        <P className="mt-3">
          The annotation tool works by drawing boxes with a mouse or trackpad,
          so it isn&apos;t available on phones and tablets. Open this page on a
          desktop or laptop and you can pick up right where you are.
        </P>
        <P className="mt-3">
          Everything else — your dashboard, your progress, and the rest of
          Imprint — works fine here.
        </P>

        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <Button variant="secondary" onClick={copyLink}>
            {copied ? "Link copied" : "Copy link for later"}
          </Button>
          <Link href="/contribute" className="flex">
            <Button variant="neutral" fullWidth>Back to dashboard</Button>
          </Link>
        </div>
      </Card>
    </Container>
  );
}
