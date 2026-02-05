import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// UI Components
import { H2 } from "@/ui/Typography";
import { P } from "@/ui/Typography";

// Dynamically import the map with SSR disabled
const CityMap = dynamic(() => import('./CityMap'), {
  ssr: false, // This is crucial for Leaflet to work in Next.js
  loading: () => (
    <div className="w-full h-[400px] bg-gray-200 animate-pulse flex items-center justify-center rounded-xl border-4 border-black">
      <p className="text-xl font-bold text-gray-400">Loading Map...</p>
    </div>
  ),
});

export default function SubHero() {
  const [scrollState, setScrollState] = useState(0);

  const handleScroll = () => {
    setScrollState(window.scrollY);
  };

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    // Cleanup function to remove listener when component unmounts
    return () => window.removeEventListener("scroll", handleScroll);
  }, []); // <--- Added empty dependency array (optimization)

  return (
    <section className="flex container mx-auto flex-col-reverse content-center justify-around xl:flex-row p-5 gap-10 mt-20 lg:mt-15">
      
      {/* Left Side: The Map (Replaces the old Image) */}
      <div
        className={`w-full xl:w-1/2 duration-300 ease-in ${
          scrollState < 300 ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
        }`}
      >
        {/* We removed <Image> and put <CityMap> here */}
        <CityMap />
      </div>

      {/* Right Side: The Text */}
      <div className="flex flex-col justify-center xl:w-1/2">
        <div
          className={`duration-300 ease-in ${
            scrollState < 300 ? "opacity-0" : "opacity-100"
          }`}
        >
          <H2>
            Help Us Assess the Accessibility and Walkability of Metro Manila Sidewalks
          </H2>
        </div>
        <div
          className={`mt-4 duration-300 ease-in ${
            scrollState < 300 ? "opacity-0" : "opacity-100"
          }`}
        >
          <P>
            Many Filipinos living in urban areas rely heavily on roads and
            sidewalks to carry out their daily routines. Public mass
            transportation systems such as jeepneys, buses, and trains can be
            considered as the backbone of daily commuting for millions of
            Filipinos. The walkability of sidewalks leading to key transit
            areas and other public spaces is vital, and quality public
            infrastructure must be made available and accessible to all people.
          </P>
        </div>
      </div>
    </section>
  );
}``