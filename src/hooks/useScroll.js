import { useState, useEffect } from "react";

export function useScroll() {
    const [scrollPosition, setScrollPosition] = useState(0);

    useEffect(() => {
        const handleScroll = () => {
            setScrollPosition(window.scrollY);
        };

        window.addEventListener("scroll", handleScroll);
        handleScroll(); // Call right away to get initial position

        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return scrollPosition;
}
