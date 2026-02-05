import Page from '@/ui/page';
import H1 from '@/ui/heading/h1';
import HelpDirectory from 'features/contribute/help';

export default function ContributePage() {
  return (
    <Page
      title="Help - Imprint Contribute"
      description="Learn more how to use Imprint as a crowdsourcing platform."
      contribute
    >
      <section className="container mx-auto px-5">
        <H1>Imprint Annotation Guide</H1>
      </section>
      <HelpDirectory />
    </Page>
  );
}
