import { useEffect, useState } from "react";
import { isMobile } from "react-device-detect";
import { canAnnotateOn } from "@/util/validators/canAnnotate";

/**
 * Whether this device can run the annotation tool for this person.
 *
 * Contributors can annotate on any device (9 Oct 2026,
 * IMPRINT_contributor_mobile.md section 6): on phones and tablets the tool has
 * a touch interaction and a sheet layout. Annotators stay on desktops and
 * laptops, since their steps (the Sidewalk outline, Obstructions) are built
 * for a mouse or trackpad, and get the desktop-only notice anywhere else. The
 * rule is canAnnotateOn in util/validators/canAnnotate.js.
 *
 * Returns `null` until the check runs in the browser, then `true` or `false`.
 * Callers must render the same thing for `null` that the server rendered — the
 * answer depends on the device, so deciding during server rendering would
 * mismatch on one kind of device or the other.
 *
 * For annotators the main test is `(pointer: fine)`, which asks whether the
 * pointer can hit a small target. That beats reading the user agent in both
 * directions: iPad Safari reports a desktop user agent, while a touchscreen
 * laptop can annotate perfectly well. The user agent is still checked as a
 * second opinion. The answer updates mid-session, so connecting a mouse
 * unblocks the tool.
 */
export function useCanAnnotate(isAnnotator = false) {
  const [canAnnotate, setCanAnnotate] = useState(null);

  useEffect(() => {
    const query = window.matchMedia?.("(pointer: fine)");

    // A browser without matchMedia is an old desktop, not a phone. Don't lock
    // someone out over a missing API.
    const evaluate = (fine) => setCanAnnotate(canAnnotateOn({ isAnnotator, finePointer: fine, isMobileUA: isMobile }));
    evaluate(query ? query.matches : true);

    if (!query?.addEventListener) return undefined;

    // Plugging in a mouse or docking a tablet changes the answer.
    const onChange = (event) => evaluate(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [isAnnotator]);

  return canAnnotate;
}
