import { useRef } from "react";
import dynamic from "next/dynamic";
import { TICKS, demoFrame } from "@/features/home/howItWorks/demoScript";
import { STILL_TICKS } from "@/features/home/HowItWorks";

const DemoStage = dynamic(() => import("@/features/home/howItWorks/DemoStage"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-surface-subtle animate-pulse motion-reduce:animate-none" />,
});

/**
 * One of the landing page's preview stills, for the annotation guide (16 Oct
 * 2026). The preview draws the task from the tool's own components
 * (DemoStage), so a still of it shows the tool as it is, and changes with it,
 * where the screen recordings it replaces went out of date. `index` is the
 * preview's chapter (STILL_TICKS, the same stills as reduced motion shows).
 *
 * Decorative: inert and hidden from screen readers, since the guide's text
 * says what it shows. Loaded in the browser only, like the preview.
 */
export default function GuideStill({ index }) {
  const captionRef = useRef(null);
  const frame = demoFrame(STILL_TICKS[index] / TICKS);
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-card border border-line bg-ground">
      <div className="absolute inset-0" inert aria-hidden="true">
        <DemoStage frame={frame} captionRef={captionRef} instant />
      </div>
    </div>
  );
}
