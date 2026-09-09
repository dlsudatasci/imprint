import { useState, useEffect } from "react";

/**
 * Current vertical scroll offset in pixels.
 *
 * Used for scroll-position thresholds, such as the navbar's shadow appearing
 * once the page has moved. Reports the starting position on mount, so it is
 * correct on a page loaded partway down.
 *
 * Not throttled: the component using it re-renders on every scroll event. That
 * is cheap enough for a threshold comparison, but throttle it before driving
 * anything heavier.
 */
export function useScroll() {
    const [scrollPosition, setScrollPosition] = useState(0);

    useEffect(() => {
        const handleScroll = () => {
            setScrollPosition(window.scrollY);
        };

        window.addEventListener("scroll", handleScroll);
        handleScroll(); // Seed the starting position before any scrolling

        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return scrollPosition;
}
