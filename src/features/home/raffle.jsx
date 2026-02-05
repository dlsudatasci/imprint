import React, { useEffect, useState, useRef } from "react";
import { H2 } from "@/ui/Typography";
import { P } from "@/ui/Typography";
import styles from "./styles.module.scss";

export default function Raffle() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const callbackFunction = (entries) => {
      const [entry] = entries;
      // This automatically sets true when visible, false when not
      setIsVisible(entry.isIntersecting);
    };

    const options = {
      root: null,
      rootMargin: "0px",
      threshold: 0.3, // Trigger when 30% of the element is visible
    };

    const observer = new IntersectionObserver(callbackFunction, options);
    const currentRef = ref.current;

    if (currentRef) observer.observe(currentRef);

    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, []);

  return (
    <section className="flex container mx-auto p-5 flex-col mb-5 lg:mb-15">
      {/* We attach the 'ref' here so the observer watches this specific box */}
      <div ref={ref} className="mx-auto lg:px-24">
        
        {/* Header - Fades in/out based on isVisible */}
        <div
          className={`duration-500 ease-in-out text-center transition-opacity ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <H2>Any Rewards?</H2>
        </div>

        {/* Content Box - Fades in/out with a slight delay */}
        <div
          className={`flex justify-around flex-wrap mt-4 duration-700 ease-in-out transition-opacity ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
         <div className={`${styles.prize} w-full max-w-4xl px-8 pt-14 pb-8 flex justify-center`}>
            <P className={`${styles.infoPrize} text-center max-w-2xl mx-auto leading-relaxed`}>
              This project <strong>does not</strong> offer monetary rewards. Instead, it
              encourages volunteers to contribute through personal motivation,
              supporting research and promoting urban walkability to help create
              better cities for everyone.
            </P>
          </div>
        </div>
      </div>
    </section>
  );
}