import { useCallback, useEffect, useState } from "react";
import Page from "@/ui/page";
import { LoadingScreen } from "@/ui";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import Hero from "@/features/home/hero";
import CityStats from "@/features/home/CityStats";
import SubHero from "@/features/home/subhero";
import ActionSection from "@/features/home/ActionSection";

/**
 * The public landing page: hero, city map, contribution figures, and the call
 * to volunteer.
 *
 * `selectedCity` lives here because two children share it — the map handles the
 * clicking, the figures react to it. null means "all areas".
 *
 * The intro animation covers the page until two things are both true: the
 * public stats have arrived, and the walk has reached its greeting. Waiting for
 * the greeting is deliberate; cutting the animation short because a request
 * happened to return early looks like a glitch.
 *
 * It runs at most once a day per browser. A timestamp in localStorage
 * suppresses it on reloads, and it returns for a genuinely new visit. That
 * check runs before the first paint, so a returning visitor never sees a frame
 * of it.
 *
 * It sits over the page rather than replacing it, so the map and hero load
 * behind it and are ready the moment it lifts.
 */

/** localStorage key holding when the intro animation was last shown. */
const LOADER_SEEN_KEY = "imprint:introSeenAt";
/** How long before it plays again. A day is often enough to still feel like a welcome. */
const LOADER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Matches the overlay's CSS transition, below. */
const EXIT_MS = 350;

export default function Index() {
  const [selectedCity, setSelectedCity] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [loopDone, setLoopDone] = useState(false);
  // "mounted" until the localStorage check runs, then either "showing" or "gone".
  const [intro, setIntro] = useState("showing");

  const showLoader = intro !== "gone";
  const exiting = intro === "exiting";

  // Stable identities: both are in effect dependency lists downstream, and a new
  // function each render would refire the fetch or restart the animation.
  const handleFirstLoad = useCallback(() => setDataReady(true), []);
  const handleLoopComplete = useCallback(() => setLoopDone(true), []);

  // Skip the intro for anyone who has seen it recently. A layout effect, so the
  // overlay is gone before the first paint rather than flashing for a frame.
  useIsomorphicLayoutEffect(() => {
    let seenAt = 0;
    try {
      seenAt = Number(window.localStorage.getItem(LOADER_SEEN_KEY)) || 0;
    } catch {
      // Private mode, or storage disabled. Showing the intro is the safe
      // fallback — it costs a few seconds, it does not break anything.
    }
    if (seenAt && Date.now() - seenAt < LOADER_COOLDOWN_MS) setIntro("gone");
  }, []);

  // Both conditions met: stamp the cooldown and start the exit.
  useEffect(() => {
    if (intro !== "showing" || !dataReady || !loopDone) return;
    try {
      window.localStorage.setItem(LOADER_SEEN_KEY, String(Date.now()));
    } catch {
      // Nothing to do; it just means they see it again next time.
    }
    setIntro("exiting");
  }, [intro, dataReady, loopDone]);

  // Unmount once the fade has run. This is its own effect on purpose: the timer
  // has to outlive the render that starts it, and an effect that both sets
  // "exiting" and watches `intro` would tear its own timeout down on the very
  // next render, leaving the overlay stuck mid-exit — invisible, but still
  // holding the scroll lock below.
  useEffect(() => {
    if (intro !== "exiting") return;
    const t = setTimeout(() => setIntro("gone"), EXIT_MS);
    return () => clearTimeout(t);
  }, [intro]);

  // Never let the loading screen become the page. If the stats request hangs —
  // a database that is down rather than slow — the rest of the landing page is
  // still perfectly usable, and CityStats shows its own skeleton. Treat the data
  // as ready after a few seconds regardless; the loop still gets to finish.
  useEffect(() => {
    const t = setTimeout(() => setDataReady(true), 6000);
    return () => clearTimeout(t);
  }, []);

  // The overlay is fixed, so the page behind it would otherwise still scroll.
  useEffect(() => {
    if (!showLoader) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [showLoader]);

  return (
    <Page
      title="Home - Imprint"
      description="Welcome to Imprint! Help us learn more about our streets."
      contribute={false}
    >
      {showLoader && (
        <LoadingScreen
          fullscreen
          exiting={exiting}
          onLoopComplete={handleLoopComplete}
        />
      )}

      <Hero selectedCity={selectedCity} onCitySelect={setSelectedCity} />
      <CityStats selectedCity={selectedCity} onFirstLoad={handleFirstLoad} />
      <SubHero />
      <ActionSection />
    </Page>
  );
}
