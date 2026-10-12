import { IconButton } from "@/ui";
import { PauseIcon, StopIcon, HelpIcon } from "@/ui/icons";

/**
 * The top of the annotation screen on phones and tablets (contributors, 9 Oct
 * 2026, IMPRINT_contributor_mobile.md section 4.2), in place of the progress
 * strip and the big "Sidewalk #n" title: which image this is, a thin bar for
 * the share of the session done, and Pause and Stop, which open the same
 * dialogs as on the desktop.
 *
 * In the tutorial it also has a ? button (12 Oct 2026) that shows the step's
 * tour again, since the touch tours have no beacons to tap.
 */
export default function MobileTopBar({ current, total, onPause, onStop, onShowTour, isTutorial = false }) {
  const done = total > 0 ? Math.min(1, Math.max(0, (current - 1) / total)) : 0;
  const stopLabel = isTutorial ? "Stop Tutorial" : "Stop Session";
  return (
    <header
      className="shrink-0 bg-surface border-b border-line"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="h-12 px-3 flex items-center gap-2">
        <div className="flex-1 min-w-0 pl-1">
          <p className="text-sm font-semibold text-ink leading-tight truncate">
            {isTutorial ? "Tutorial: " : ""}Sidewalk {current} of {total}
          </p>
          <div
            role="progressbar"
            aria-label="Images done"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={Math.max(0, current - 1)}
            className="mt-1 h-1 w-full max-w-[12rem] rounded-full bg-line overflow-hidden"
          >
            <div className="h-full bg-primary rounded-full" style={{ width: `${done * 100}%` }} />
          </div>
        </div>
        {onShowTour && (
          <IconButton aria-label="Show the tour" title="Show the tour" onClick={onShowTour}>
            <HelpIcon size={20} />
          </IconButton>
        )}
        <IconButton aria-label="Pause Session" title="Pause Session" onClick={onPause}>
          <PauseIcon size={18} />
        </IconButton>
        <IconButton aria-label={stopLabel} title={stopLabel} tone="danger" onClick={onStop}>
          <StopIcon size={18} />
        </IconButton>
      </div>
    </header>
  );
}
