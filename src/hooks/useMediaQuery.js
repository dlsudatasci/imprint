import { useEffect, useState } from "react";

/**
 * A media query's live answer: `null` until it has run in the browser, then
 * `true` or `false`, updated when it changes (the window is resized, or the
 * reduced-motion setting is switched).
 *
 * `null` first, so the server's HTML and the browser's first render agree, and
 * a caller can wait for the real answer instead of flashing the wrong layout.
 */
export function useMediaQuery(query) {
  const [match, setMatch] = useState(null);
  useEffect(() => {
    const list = typeof window !== "undefined" ? window.matchMedia?.(query) : null;
    if (!list) {
      setMatch(false);
      return undefined;
    }
    setMatch(list.matches);
    const onChange = (event) => setMatch(event.matches);
    list.addEventListener?.("change", onChange);
    return () => list.removeEventListener?.("change", onChange);
  }, [query]);
  return match;
}

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
