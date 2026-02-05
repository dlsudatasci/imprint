/* eslint-disable no-use-before-define */
import React, { useEffect, useState, useRef } from "react";

import H2 from "@/ui/heading/h2";
import H3 from "@/ui/heading/h3";
import P from "@/ui/heading/p";
import styles from "./styles.module.scss";

export default function Help() {
  const [isVisible, setIsVisible] = useState(false);
  const [passed, setPassed] = useState(false);
  const [passed1, setPassed1] = useState(true);
  const ref = useRef(null);

  useEffect(() => {
    const callbackFunction = (entries) => {
      const [entry] = entries;

      if (isVisible) {
        setPassed1(false);
        setPassed(true);
      }

      if (!passed1 && !isVisible) {
        setPassed(false);
        setPassed1(true);
      }

      setIsVisible(entry.isIntersecting || (passed && passed1));
    };
    
    const options = {
      root: null,
      rootMargin: "0px",
      // CHANGED: Lowered threshold to 0.2 so it triggers sooner on mobile
      // 1.0 means "wait until 100% of the item is visible" which might be impossible on phones
      threshold: 0.2, 
    };

    const observer = new IntersectionObserver(callbackFunction, options);
    if (ref.current) observer.observe(ref.current);

    const refCurrent = ref.current;

    return () => {
      if (refCurrent) observer.unobserve(refCurrent);
    };
  }, [ref, isVisible, passed, passed1]);

  return (
    // MOVED ref={ref} here so it watches the whole section
    <section ref={ref} className="container mx-auto py-5 px-5 mt-20 lg:mt-15">
      
      {/* ADDED animation classes to this div */}
      <div 
        className={`duration-500 ease-in transition-all ${
          !isVisible ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
        }`}
      >
        <H2 className="text-center">How can you help?</H2>
        <P className="text-center py-5 lg:mx-20">
          You must first sign up to the platform so that imprint can track the
          volunteers that are using the platform. No need to worry since imprint will
          not be collecting any <span className="font-bold"> personal identifiable information (PII) </span> except
          your email address. The email address provided will primarily be used <span className="font-bold">for communication.</span> 
          Once that&apos;s finished, you can start contributing to Imprint by doing these three tasks:
        </P>
      </div>

      {/* Removed ref={ref} from here since it is now on the parent section */}
      <div>
        <ul className="flex flex-row flex-wrap justify-around ml-8">
          <li
            className={`duration-500 ease-in ${styles.card} ${
              !isVisible ? "opacity-0 pl-10" : "pt-0 opacity-100"
            }`}
          >
            <H3>
              <span>#1</span>
              <span>Identify</span>
            </H3>
            <P>
              Classify pre-labeled objects and determine whether they are
              obstructions that contribute to your accessibility score or not.
            </P>
          </li>
          <li
            className={`duration-700 ease-in ${styles.card} ${
              !isVisible ? "opacity-0 pl-10" : "pt-0 opacity-100"
            }`}
          >
            <H3>
              {" "}
              <span>#2</span>
              <span>Add Labels</span>{" "}
            </H3>
            <P>
              Label additional sidewalk obstructions that the initial model might have missed.
            </P>
          </li>
          <li
            className={`duration-1000 ease-in ${styles.card} ${
              !isVisible ? "opacity-0 pl-10" : "pt-0 opacity-100"
            }`}
          >
            <H3>
              <span>#3</span>
              <span>Score</span>
            </H3>
            <P>
              Rate the accessibility of the sidewalk from 1-10 based on the
              labeled objects on the sidewalk image
            </P>
          </li>
        </ul>
      </div>
    </section>
  );
}