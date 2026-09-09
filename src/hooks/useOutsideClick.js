import { useEffect } from "react";

/**
 * Runs `callback` when a click lands outside `ref`.
 *
 * This is the close-on-click-away behaviour behind the navbar dropdowns and the
 * mobile menu.
 *
 * `callback` is a dependency, so passing an inline arrow function detaches and
 * reattaches the listener on every render. That is harmless at Imprint's
 * current scale, but wrap it in useCallback if a frequently re-rendering
 * component ever uses this.
 */
export function useOutsideClick(ref, callback) {
    useEffect(() => {
        function handleClickOutside(event) {
            if (ref.current && !ref.current.contains(event.target)) {
                callback();
            }
        }

        // mousedown rather than click: closing on press means the menu is gone
        // before the click can reach whatever sits underneath it
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [ref, callback]);
}