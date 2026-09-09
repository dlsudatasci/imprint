/**
 * Route for /contribute/help — the annotation guide for signed-in
 * contributors. The same guide is available publicly at /demo.
 */
import { H1, Container } from "@/ui";
import Page from '@/ui/page';
import HelpDirectory from 'features/contribute/help';

export default function ContributePage() {
  return (
    <Page
      title="Help - Imprint Contribute"
      description="Learn more how to use Imprint as a crowdsourcing platform."
      contribute
    >
      <Container as="section">
        <H1>Imprint Annotation Guide</H1>
      </Container>
      <HelpDirectory />
    </Page>
  );
}
