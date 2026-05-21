import React, { useEffect, useState, useRef } from "react";
import { H2, P } from "@/ui/Typography";
import { Search, Tag, Star, LineChart, Map, Users } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function ActionSection() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);
  const { status } = useSession();

  useEffect(() => {
    const callbackFunction = (entries) => {
      const [entry] = entries;
      if (entry.isIntersecting) {
        setIsVisible(true);
      }
    };

    const options = { root: null, rootMargin: "0px", threshold: 0.1 };
    const observer = new IntersectionObserver(callbackFunction, options);
    const currentRef = ref.current;

    if (currentRef) observer.observe(currentRef);

    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, []);

  const steps = [
    {
      title: "Identify",
      description: "Classify pre-labeled objects and determine whether they are obstructions.",
      icon: <Search className="w-6 h-6 text-primary" />
    },
    {
      title: "Add Labels",
      description: "Label additional sidewalk obstructions that the initial AI model missed.",
      icon: <Tag className="w-6 h-6 text-primary" />
    },
    {
      title: "Score",
      description: "Rate the overall accessibility of the sidewalk from 1-10.",
      icon: <Star className="w-6 h-6 text-primary" />
    }
  ];

  const impacts = [
    {
      title: "Support Research",
      description: "Help researchers pave the way for better urban accessibility.",
      icon: <LineChart className="w-6 h-6 text-primary" />
    },
    {
      title: "Improve Walkability",
      description: "Highlight critical areas that need structural improvements.",
      icon: <Map className="w-6 h-6 text-primary" />
    },
    {
      title: "Empower the Community",
      description: "Pave the way for safer, more inclusive cities for people with disabilities.",
      icon: <Users className="w-6 h-6 text-primary" />
    }
  ];

  return (
    <section ref={ref} className="container mx-auto px-5 py-16 lg:py-24 border-t border-gray-100">
      <div
        className={`max-w-7xl mx-auto duration-700 ease-out transition-all ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">

          {/* Left Column: How to Help */}
          <div>
            <H2 className="mb-4 font-bold tracking-tight text-3xl">How can you help?</H2>
            <P className="text-gray-500 mb-10 leading-relaxed">
              Joining Imprint is quick and secure. We only collect your email address for communication. Once signed in, you can start contributing in three simple steps:
            </P>

            <div className="relative">
              {/* Vertical connecting line */}
              <div className="absolute top-8 bottom-8 left-6 w-0.5 bg-gray-100 z-0 hidden sm:block"></div>

              <div className="space-y-4 relative z-10 mt-1">
                {steps.map((step, index) => (
                  <div key={index} className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 group p-6">
                    <div className="bg-white border-2 border-blue-50 w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm group-hover:border-primary transition-colors">
                      {step.icon}
                    </div>
                    <div className="pt-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h3>
                      <p className="text-gray-500 text-sm leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: The Real Reward */}
          <div>
            <H2 className="mb-4 font-bold tracking-tight text-3xl">The Real Reward</H2>
            <P className="text-gray-500 mb-10 leading-relaxed">
              While this project does not offer monetary compensation, your contributions create lasting, real-world impact.
            </P>

            <div className="space-y-4 mb-10 mt-1 lg:mt-20">
              {impacts.map((impact, index) => (
                <div
                  key={index}
                  className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col sm:flex-row items-start gap-4 sm:gap-6"
                >
                  <div className="bg-blue-50 w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
                    {impact.icon}
                  </div>
                  <div className="pt-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{impact.title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">
                      {impact.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {status === "unauthenticated" && (
          <div className="pt-8 pb-4 flex justify-center w-full border-t border-gray-100 mt-8">
            <Link
              href="/contribute"
              className="inline-block font-bold text-primary bg-white hover:text-white border-2 border-primary hover:bg-primary px-10 py-4 rounded-full shadow-sm hover:shadow-md transition-all duration-300"
            >
              Start Volunteering Today
            </Link>
          </div>
        )}

      </div>
    </section>
  );
}
