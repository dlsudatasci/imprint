import { createContext, useContext, useEffect } from "react";

/**
 * Lets a page take the site's navbar and footer away while it shows a
 * full-screen surface (12 Oct 2026). The annotation screen on phones and
 * tablets covers the page, but the navbar is `relative z-50` and was painted
 * over its top bar: the logo over "Sidewalk 1 of 3" and the menu button over
 * Pause and Stop. Raising the screen's z-index would hide the navbar but leave
 * its links in the keyboard's and a screen reader's path, so it is not
 * rendered instead.
 *
 * ContributeLayout provides { hidden, setHidden }. Outside a provider the hook
 * does nothing.
 */
export const SiteChromeContext = createContext(null);

/** Hides the navbar and footer while `hide` is true and this component is mounted. */
export function useHideSiteChrome(hide) {
  const setHidden = useContext(SiteChromeContext)?.setHidden;
  useEffect(() => {
    if (!setHidden) return undefined;
    setHidden(Boolean(hide));
    return () => setHidden(false);
  }, [setHidden, hide]);
}
