import { setConsoleFunction, getConsoleFunction } from "three";

/**
 * Keeps one known warning out of the browser console (26 Oct 2026).
 *
 * three.js 0.183 deprecated THREE.Clock in favour of THREE.Timer and warns
 * every time one is made. @react-three/fiber makes one for every <Canvas>, the
 * login page's scene included, and every 9.x release up to 9.8.2 still does:
 * the switch to Timer comes with fiber 10, which is only an alpha. IMPRINT's
 * own code never uses Clock, so the warning says nothing anyone can act on.
 *
 * three.js routes its own console output through setConsoleFunction() when one
 * is set. This one drops exactly that deprecation and passes every other
 * message on the way three.js itself would (a stack trace object becomes an
 * Error, as in three's warn and error). Remove it once @react-three/fiber 10 is
 * released and installed.
 */
export const CLOCK_DEPRECATION =
  "THREE.THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.";

/** three.js's console output, less the Clock deprecation. */
export function threeConsole(type, message, ...params) {
  if (type === "warn" && message === CLOCK_DEPRECATION) return;
  const first = params[0];
  if ((type === "warn" || type === "error") && first && first.isStackTrace) {
    console[type](first.getError(message));
    return;
  }
  console[type](message, ...params);
}

/**
 * Sets threeConsole as three.js's console function, unless another one is
 * already set (which is left alone). Call it before a <Canvas> mounts.
 */
export function quietClockDeprecation() {
  if (!getConsoleFunction()) setConsoleFunction(threeConsole);
}
