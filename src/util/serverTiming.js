/**
 * Server-Timing for /api/annotationGet (S16, 3 Nov 2026). The first pilot
 * participants found a session slow to start, and which part of the route
 * takes the time cannot be read from the code, so the route says it: Chrome
 * shows the parts under the request's Timing tab.
 *
 * Durations only, never data: the names come from a fixed list, and each
 * duration is milliseconds to one decimal. Sent with the answer, never stored.
 */

/** The parts of annotationGet, in the order they run */
export const SERVER_TIMING_NAMES = Object.freeze(["auth", "check", "draw", "prepare", "save"]);

/**
 * A timer whose `mark(name)` records the milliseconds since the previous mark
 * (or since the timer was made), and whose `header()` is the Server-Timing
 * value, `auth;dur=12.3, draw;dur=40.0`. A name not on the list is refused.
 * `now` is for tests.
 */
export function serverTimer(now = () => performance.now()) {
  let last = now();
  const marks = [];
  return {
    mark(name) {
      if (!SERVER_TIMING_NAMES.includes(name)) throw new Error(`Unknown Server-Timing name: ${name}`);
      const at = now();
      marks.push({ name, dur: Math.max(0, at - last) });
      last = at;
    },
    header() {
      return marks.map(({ name, dur }) => `${name};dur=${dur.toFixed(1)}`).join(", ");
    },
  };
}
