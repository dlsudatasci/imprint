import Link from "next/link";
import dynamic from "next/dynamic";
import { H1 } from "@/ui/Typography";
import { P } from "@/ui/Typography";
import Button from "@/ui/buttons/Button";

const CityMap = dynamic(() => import("./CityMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] bg-gray-100 animate-pulse flex items-center justify-center rounded-2xl border border-gray-200">
      <p className="text-sm font-medium text-gray-400">Loading Map...</p>
    </div>
  ),
});

export default function Hero({ selectedCity, onCitySelect }) {
  return (
    <section className="container flex flex-col mx-auto items-center lg:flex-row lg:justify-between py-10 md:p-5 px-5 mb-6 gap-10 lg:gap-16">
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
        <div className="mt-5 flex">
          <div className="mr-5">
            <Button variant="outline">
              <Link href="/contribute">Contribute</Link>
            </Button>
          </div>
          <Button variant="outline">
            <Link href="/about">Learn More</Link>
          </Button>
        </div>
      </div>

      <div className="w-full lg:flex-1 min-w-[50%]">
        <CityMap selectedCity={selectedCity} onCitySelect={onCitySelect} />
      </div>
    </section>
  );
}
