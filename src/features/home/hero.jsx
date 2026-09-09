import Link from "next/link";
import dynamic from "next/dynamic";
import { H1, P, Button, Container } from "@/ui";

// ssr:false is required, not an optimization — Leaflet reaches for `window` at
// import time and throws during server rendering. The skeleton reserves the
// map's height so the rest of the page doesn't jump when it arrives.
const CityMap = dynamic(() => import("./CityMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] bg-surface-subtle animate-pulse flex items-center justify-center rounded-card border border-line">
      <p className="text-sm font-medium text-subtle">Loading Map...</p>
    </div>
  ),
});

export default function Hero({ selectedCity, onCitySelect }) {
  return (
    <Container as="section" className="flex flex-col items-center lg:flex-row lg:justify-between py-10 md:py-5 mb-6 gap-10 lg:gap-16">
      <div className="flex flex-col mx-auto lg:mx-0 justify-center w-full max-w-md lg:max-w-lg xl:max-w-xl">
        <H1>
          Welcome to <span className="font-bold text-primary">Imprint</span>
        </H1>
        <div className="mt-4">
          <P>
            We aim to accelerate crowdsourced streetscape data collection to
            understand how people perceive accessibility, safety, and
            walkability in urban environments.
          </P>
        </div>
        <div className="mt-6 flex gap-4">
          <Link href="/contribute">
            <Button variant="secondary">Volunteer</Button>
          </Link>
          <Link href="/about">
            <Button variant="neutral">Learn More</Button>
          </Link>
        </div>
      </div>

      <div className="w-full lg:flex-1 min-w-[50%]">
        <CityMap selectedCity={selectedCity} onCitySelect={onCitySelect} />
      </div>
    </Container>
  );
}
