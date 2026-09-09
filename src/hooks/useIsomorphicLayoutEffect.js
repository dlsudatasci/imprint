import { useEffect, useLayoutEffect } from "react";

/**
 * useLayoutEffect in the browser, useEffect on the server.
 *
 * Use this for work that must happen before the browser paints — typically
 * removing something the server rendered, which would otherwise flash on screen
 * for a frame. The landing page uses it to skip the intro animation for a
 * returning visitor.
 *
 * React warns if useLayoutEffect runs during server rendering, since there is
 * no layout to measure, so on the server this falls back to useEffect. Nothing
 * is lost: effects don't run during server rendering either way.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;
