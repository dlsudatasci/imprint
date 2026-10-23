import { useRef } from "react";
import dynamic from "next/dynamic";
import { TICKS, demoFrame } from "@/features/home/howItWorks/demoScript";
import { touchFrame } from "@/features/home/howItWorks/touchScript";
import { STILL_TICKS, TOUCH_STILL_TICKS } from "@/features/home/HowItWorks";
import { useAnnotateLayout, TOUCH_DEVICE_QUERY } from "@/hooks/useAnnotateLayout";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const loading = () => <div className="h-full w-full bg-surface-subtle animate-pulse motion-reduce:animate-none" />;
const DemoStage = dynamic(() => import("@/features/home/howItWorks/DemoStage"), { ssr: false, loading });
const TouchStage = dynamic(() => import("@/features/home/howItWorks/TouchStage"), { ssr: false, loading });

/** The laptop picture's frame, the same as before */
const DESKTOP_FRAME = "relative aspect-[16/10] w-full overflow-hidden rounded-card border border-line bg-ground";

/**
 * The phone and tablet picture's frame (23 Oct 2026): screen-shaped, so the
 * tool's phone layout shows at a size that reads. Upright like a phone on a
 * phone, wider on a tablet, and never wider than a phone or a small tablet,
 * so it does not fill a tablet's whole column.
 */
const TOUCH_FRAME = "relative mx-auto aspect-[9/16] w-full max-w-[400px] overflow-hidden rounded-card border border-line bg-ground sm:aspect-[3/4] sm:max-w-[560px]";

/**
 * One of the landing page's preview stills, for the annotation guide (16 Oct
 * 2026). The preview draws the task from the tool's own components
 * (DemoStage), so a still of it shows the tool as it is, and changes with it,
 * where the screen recordings it replaces went out of date. `index` is the
 * preview's chapter (STILL_TICKS, the same stills as reduced motion shows).
 *
 * On phones and tablets (23 Oct 2026, IMPRINT_guide_touch_stills.md) it is
 * the phone and tablet preview's still instead (TouchStage, TOUCH_STILL_TICKS),
 * wherever the tool itself would use its phone layout (useAnnotateLayout), as
 * on the landing page. Before, a phone showed the laptop page shrunk to the
 * column's width, too small to read and not the screen a contributor there
 * gets. Until the browser has said which, the frame waits empty.
 *
 * Decorative: inert and hidden from screen readers, since the guide's text
 * says what it shows. Loaded in the browser only, like the preview.
 */
export default function GuideStill({ index }) {
  const captionRef = useRef(null);
  const layout = useAnnotateLayout();
  const coarse = useMediaQuery(TOUCH_DEVICE_QUERY) === true;

  if (layout === "sheet") {
    const frame = touchFrame(TOUCH_STILL_TICKS[index] / TICKS);
    return (
      <div data-guide-still="touch" className={TOUCH_FRAME}>
        <div className="absolute inset-0" inert aria-hidden="true">
          <TouchStage frame={frame} coarse={coarse} instant />
        </div>
      </div>
    );
  }

  return (
    <div data-guide-still={layout === "desktop" ? "desktop" : undefined} className={DESKTOP_FRAME}>
      <div className="absolute inset-0" inert aria-hidden="true">
        {layout === "desktop" ? <DemoStage frame={demoFrame(STILL_TICKS[index] / TICKS)} captionRef={captionRef} instant /> : loading()}
      </div>
    </div>
  );
}
