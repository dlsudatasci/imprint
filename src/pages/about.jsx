import Page from '@/ui/page';
import AboutSection from '@/features/about';

export default function LandingPage() {
  return (
    <Page
      title="About - Imprint"
      description="Learn more about Imprint, our crowdsourcing platform for street accessibility."
      contribute={false}
    >
      <AboutSection />
    </Page>
  );
}
