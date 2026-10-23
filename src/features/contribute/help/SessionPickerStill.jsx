import { useLayoutEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Button, Card } from "@/ui";
import { CONTRIBUTOR_OPTIONS } from "@/features/annotate/sessionOptions";
import SessionSizeOptions, { SESSION_PICKER_COPY } from "@/features/annotate/SessionSizeOptions";

/** The picture is laid out at this size, then scaled to fit its frame. */
export const PICKER_STAGE = Object.freeze({ width: 800, height: 500 });

/**
 * On a phone (23 Oct 2026), the size a phone shows the picker at, scaled to
 * fit its frame. Under 640 px the real picker (selection.jsx) is a different
 * layout: two cards a row, Cancel above Start, both full width. The card is
 * about 760 px tall there, so the picture is 360 by 800 (its frame 9 by 20).
 */
export const PICKER_PHONE_STAGE = Object.freeze({ width: 360, height: 800 });
/** Under this width the real picker is its phone layout (Tailwind's `sm`) */
export const PICKER_PHONE_QUERY = "(max-width: 639.98px)";

/** The size shown chosen in the picture. */
export const PICKER_STILL_SELECTED = 10;

/**
 * The annotation guide's picture for "Start a session" (16 Oct 2026): the
 * session picker as a contributor sees it, built from the picker's own words
 * and size cards (SessionSizeOptions), with 10 chosen. The landing page's
 * preview starts inside the tool, so it has no picture of this step.
 *
 * Laid out at a fixed size and scaled to its frame, like the preview. On a
 * phone (23 Oct 2026, IMPRINT_guide_touch_stills.md) it is the picker as a
 * phone shows it, in an upright frame: before, the laptop picture was shrunk
 * to about half size and showed the laptop layout. Decorative: inert and
 * hidden from screen readers, since the guide's text says what it shows.
 */
export default function SessionPickerStill() {
  const frameRef = useRef(null);
  const [scale, setScale] = useState(null);
  const phone = useMediaQuery(PICKER_PHONE_QUERY) === true;
  const stage = phone ? PICKER_PHONE_STAGE : PICKER_STAGE;

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const fit = () => setScale(Math.min(el.clientWidth / stage.width, el.clientHeight / stage.height) || null);
    fit();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [stage]);

  return (
    <div
      ref={frameRef}
      data-guide-still="session-picker"
      data-phone={phone ? "" : undefined}
      className={
        phone
          ? "relative mx-auto aspect-[9/20] w-full max-w-[400px] overflow-hidden rounded-card border border-line bg-ground"
          : "relative aspect-[16/10] w-full overflow-hidden rounded-card border border-line bg-ground"
      }
    >
      <div
        inert
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 flex items-center justify-center"
        style={{
          width: stage.width,
          height: stage.height,
          transform: `translate(-50%, -50%) scale(${scale ?? 1})`,
          visibility: scale ? "visible" : "hidden",
        }}
      >
        {phone ? (
          // selection.jsx's classes as a phone applies them
          <Card padding="none" className="w-[328px] px-8 py-10 text-center">
            <h2 className="font-display text-2xl font-extrabold text-ink tracking-tight">{SESSION_PICKER_COPY.title}</h2>
            <p className="mt-3 text-muted font-medium leading-relaxed">{SESSION_PICKER_COPY.lead}</p>
            <hr className="my-6 border-line-card" />
            <SessionSizeOptions options={CONTRIBUTOR_OPTIONS} selected={PICKER_STILL_SELECTED} />
            <div className="flex flex-col gap-4 mt-10">
              <Button variant="neutral" fullWidth tabIndex={-1}>{SESSION_PICKER_COPY.cancel}</Button>
              <Button fullWidth tabIndex={-1}>{SESSION_PICKER_COPY.start}</Button>
            </div>
          </Card>
        ) : (
          <Card padding="none" className="w-[720px] px-12 py-10 text-center">
            <h2 className="font-display text-3xl font-extrabold text-ink tracking-tight">{SESSION_PICKER_COPY.title}</h2>
            <p className="mt-3 text-muted font-medium leading-relaxed">{SESSION_PICKER_COPY.lead}</p>
            <hr className="my-6 border-line-card" />
            <SessionSizeOptions options={CONTRIBUTOR_OPTIONS} selected={PICKER_STILL_SELECTED} />
            <div className="flex justify-center gap-4 mt-10">
              <Button variant="neutral" tabIndex={-1}>{SESSION_PICKER_COPY.cancel}</Button>
              <Button tabIndex={-1}>{SESSION_PICKER_COPY.start}</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
