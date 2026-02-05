import Page from "@/ui/page";
import Hero from "@/features/home/hero";
import SubHero from "@/features/home/subhero";
import Help from "@/features/home/help";
import Raffle from "@/features/home/raffle";

export default function Index() {
  return (
    <Page
      title="Home - Imprint"
      description="Welcome to Imprint! Help us learn more about our streets."
      contribute={false}
    >
      <Hero />
      <SubHero />
      <Help />
      <Raffle />
    </Page>
  );
}
