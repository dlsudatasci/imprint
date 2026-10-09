/**
 * Saves unsubmitted edits shortly after they stop changing (8 Oct 2026).
 *
 * The annotation tool calls schedule() on every edit. Edits during a drag come
 * many times a second, so the save waits until they have stopped for `delayMs`
 * and runs once. flush() saves a waiting edit at once, for when the page is
 * being left or hidden. cancel() drops it.
 */
export function createEditSaver(save, delayMs = 400) {
  let timer = null;

  const run = () => {
    timer = null;
    save();
  };

  return {
    schedule() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(run, delayMs);
    },
    flush() {
      if (timer === null) return;
      clearTimeout(timer);
      run();
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
    pending() {
      return timer !== null;
    },
  };
}
