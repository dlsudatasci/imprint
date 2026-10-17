/**
 * The session picker's words and its size cards, shared by the picker itself
 * (selection.jsx) and the annotation guide's picture of it (16 Oct 2026), so
 * the guide shows the picker as it is and changes with it.
 *
 * The lead used to promise that you would "identify the surface type", a step
 * the tool dropped (pipeline_methodology.md §7n). It now names the two steps
 * the tool has.
 */
export const SESSION_PICKER_COPY = Object.freeze({
  title: "How many images would you like to annotate?",
  lead: "Each image takes about 30 seconds on average. You'll say which objects get in your way and rate the sidewalk.",
  cancel: "Cancel",
  start: "Start Session",
  starting: "Starting...",
});

/**
 * One selectable card per session size. `onSelect` is optional: without it
 * the cards are a picture (the guide), not controls.
 */
export default function SessionSizeOptions({ options, selected, onSelect, disabled = false }) {
  return (
    <div className="flex flex-wrap justify-center gap-5 mt-2">
      {options.map((option) => {
        const isSelected = selected === option.count;
        return (
          // eslint-disable-next-line react/forbid-elements -- selectable card, not a Button variant: it carries its own selected state and sizing
          <button
            key={option.count}
            type="button"
            onClick={onSelect ? () => onSelect(option.count) : undefined}
            disabled={disabled}
            aria-pressed={isSelected}
            className={`
              group flex flex-col items-center justify-center
              w-28 sm:w-32 py-6 rounded-card border-2
              transition-colors duration-300 cursor-pointer
              ${isSelected
                ? "border-primary bg-primary-50"
                : "border-line bg-surface hover:border-subtle"
              }
              disabled:cursor-not-allowed
            `}
          >
            <span className={`text-4xl sm:text-5xl font-extrabold tracking-tight transition-colors duration-300 ${isSelected ? "text-primary" : "text-body group-hover:text-ink"}`}>
              {option.label}
            </span>
            {option.time && (
              <span className={`text-sm font-semibold mt-2 transition-colors duration-300 ${isSelected ? "text-primary/70" : "text-subtle"}`}>
                {option.time}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
