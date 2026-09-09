import { useEffect, useState } from "react";
import { isMobile } from "react-device-detect";

/**
 * Whether this device can run Imprint's annotation tool.
 *
 * Annotating means drawing boxes and dragging their handles, which the tool
 * implements with mouse events only. Phones and tablets therefore can't use it,
 * and the annotate and tutorial pages show a desktop-only notice instead.
 *
 * Returns `null` until the check runs in the browser, then `true` or `false`.
 * Callers must render the same thing for `null` that the server rendered — the
 * answer depends on the device, so deciding during server rendering would
 * mismatch on one kind of device or the other.
 *
 * The main test is `(pointer: fine)`, which asks whether the pointer can hit a
 * small target. That is the question that actually matters, and it beats
 * reading the user agent in both directions: iPad Safari reports a desktop
 * user agent and would otherwise reach a canvas it can't drive, while a
 * touchscreen laptop can annotate perfectly well and shouldn't be blocked. The
 * user agent is still checked as a second opinion.
 *
 * The answer updates mid-session, so connecting a mouse unblocks the tool.
 */
export function useCanAnnotate() {
  const [canAnnotate, setCanAnnotate] = useState(null);

  useEffect(() => {
    const query = window.matchMedia?.("(pointer: fine)");

    // A browser without matchMedia is an old desktop, not a phone. Don't lock
    // someone out over a missing API.
    const evaluate = (fine) => setCanAnnotate(fine && !isMobile);
    evaluate(query ? query.matches : true);

    if (!query?.addEventListener) return undefined;

    // Plugging in a mouse or docking a tablet changes the answer.
    const onChange = (event) => evaluate(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return canAnnotate;
}
