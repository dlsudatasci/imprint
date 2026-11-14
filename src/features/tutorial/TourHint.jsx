/**
 * A short line under the top bar (phone) or the navbar (laptop) that says
 * where the tour or the practice is: the tutorial's hints, and the one-time
 * line on a contributor's first real session (S30, 14 Nov 2026), which looks
 * as the practice's reminder on tutorial photo 2 did. `wide` is for a full
 * sentence, which wraps on a small phone; a short hint stays on one line.
 * `input` is the tour's ("touch" on the sheet layout).
 */
export default function TourHint({ children, input = "pointer", wide = false }) {
  return (
    <p
      role="status"
      className={`pointer-events-none fixed left-1/2 -translate-x-1/2 z-[60] px-3 py-2 bg-ink/85 text-white text-xs font-semibold ${wide ? "w-max max-w-[calc(100vw-32px)] text-center rounded-card" : "whitespace-nowrap rounded-full"}`}
      style={{ top: input === "touch" ? "calc(env(safe-area-inset-top) + 56px)" : "calc(var(--nav-h, 64px) + 12px)" }}
    >
      {children}
    </p>
  );
}
