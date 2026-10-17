import { useEffect, useState } from "react";

/**
 * Whether the page has scrolled past `threshold` px (16 Oct 2026).
 *
 * The navbar uses it for its scroll-edge line: a bar floating over the page
 * needs an edge only once content is actually under it. `false` on the server
 * and on the first render, so the HTML and the first paint agree. The scroll
 * listener is passive and only sets state when the answer changes.
 */
export function useScrolled(threshold = 0) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const read = () => setScrolled(window.scrollY > threshold);
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, [threshold]);
  return scrolled;
}
