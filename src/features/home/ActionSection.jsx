import React, { useEffect, useState, useRef } from "react";
import { H2, P, Button, Card, Container } from "@/ui";
import Link from "next/link";
import { useSession } from "next-auth/react";

/**
 * The closing section of the landing page: how annotating works, followed by
 * the call to action.
 *
 * Checks whether the visitor is signed in, so the button reads "Volunteer" or
 * "Go to Dashboard" rather than sending an existing contributor back through
 * sign-up.
 */
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

  // Numbered rather than icon-led: this is an ordered procedure, and a numeral
  // says "step 2 of 3" in a way a magnifying glass never did.
  const steps = [
    {
      title: "Identify",
      description: "Classify pre-labeled objects and determine whether they are obstructions.",
    },
    {
      title: "Add Labels",
      description: "Label additional sidewalk obstructions that the initial AI model missed.",
    },
    {
      title: "Score",
      description: "Rate the overall accessibility of the sidewalk from 1-10.",
    }
  ];

  const impacts = [
    {
      title: "Support Research",
      description: "Help researchers pave the way for better urban accessibility.",
    },
    {
      title: "Improve Walkability",
      description: "Highlight critical areas that need structural improvements.",
    },
    {
      title: "Empower the Community",
      description: "Pave the way for safer, more inclusive cities for people with disabilities.",
    }
  ];

  return (
    <Container as="section" ref={ref} className="py-16 lg:py-24 border-t border-line-card">
      <div
        className={`duration-700 ease-out transition-all ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">

          {/* Left Column: How to Help */}
          <div>
            <H2 className="mb-4 font-bold tracking-tight text-3xl">How can you help?</H2>
            <P className="mb-10 leading-relaxed">
              Joining Imprint is quick and secure. We only collect your email address for communication. Once signed in, you can start contributing in three simple steps:
            </P>

            <div className="relative">
              {/* Vertical connecting line */}
              <div className="absolute top-8 bottom-8 left-6 w-0.5 bg-surface-subtle z-0 hidden sm:block"></div>

              <div className="space-y-4 relative z-10 mt-1">
                {steps.map((step, index) => (
                  <div key={index} className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 p-6">
                    <div className="bg-surface border-2 border-primary-100 w-12 h-12 rounded-full flex items-center justify-center shrink-0 font-display text-xl font-bold text-primary">
                      {index + 1}
                    </div>
                    <div className="pt-1">
                      <h3 className="text-xl font-bold text-ink mb-2">{step.title}</h3>
                      <p className="text-muted text-sm leading-relaxed">
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
            <H2 className="mb-4 font-bold tracking-tight text-3xl">What your work goes toward</H2>
            <P className="mb-10 leading-relaxed">
              While this project does not offer monetary compensation, your contributions create lasting, real-world impact.
            </P>

            <div className="space-y-4 mb-10 mt-1 lg:mt-20">
              {impacts.map((impact, index) => (
                <Card key={index}>
                  <h3 className="font-display text-xl font-bold text-ink mb-2">{impact.title}</h3>
                  <p className="text-muted text-sm leading-relaxed">
                    {impact.description}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {status === "unauthenticated" && (
          <div className="pt-8 pb-4 flex justify-center w-full border-t border-line-card mt-8">
            <Link href="/contribute">
              <Button variant="secondary">Start Volunteering Today</Button>
            </Link>
          </div>
        )}

      </div>
    </Container>
  );
}
