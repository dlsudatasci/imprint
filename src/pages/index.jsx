import { useState } from "react";
import Page from "@/ui/page";
import Hero from "@/features/home/hero";
import CityStats from "@/features/home/CityStats";
import SubHero from "@/features/home/subhero";
import Help from "@/features/home/help";
import Raffle from "@/features/home/raffle";

export default function Index() {
  const [selectedCity, setSelectedCity] = useState(null);

  return (
    <Page
      title="Home - Imprint"
      description="Welcome to Imprint! Help us learn more about our streets."
      contribute={false}
    >
      <Hero selectedCity={selectedCity} onCitySelect={setSelectedCity} />
      <CityStats selectedCity={selectedCity} />
      <SubHero />
      <Help />
      <Raffle />
    </Page>
  );
}
