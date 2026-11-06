/**
 * The tutorial tour's card (src/pages/contribute/tutorial.jsx), for every tour
 * of both roles and both layouts.
 *
 * Capped to the screen (S16, 3 Nov 2026): on a phone the Your Answers card
 * of the contributor tour, about 18 lines then, was taller than the room above
 * the answers sheet and ran off the top of the screen with its title. The
 * whole card is now at most the screen's height less 32 px, the title row and
 * the Step n of N row with Back and Next always in it, and only the text
 * between them scrolls. A card that already fits is unchanged. A step can
 * lower the cap with `--tour-max-h` (S16b: the room beside its target).
 */

/**
 * A tour step's text: a contributor step's intro, numbered points, `after`
 * (S16b) and note (S16), or an annotator step's paragraph. A contributor step
 * with no points has no list, only its paragraphs. Built here so tourSteps.js
 * stays plain data.
 */
export function TourStepBody({ step }) {
  if (!Array.isArray(step.points)) return <p>{step.content}</p>;
  // Each part after the first is spaced from the one before
  const parts = [];
  if (step.intro) parts.push((gap) => <p key="intro" className={gap}>{step.intro}</p>);
  if (step.points.length > 0) {
    parts.push((gap) => (
      <ol key="points" className={`list-decimal pl-5 space-y-1${gap ? ` ${gap}` : ""}`}>
        {step.points.map((point, i) => (
          <li key={point}>
            {point}
            {/* The sentence on the model's proposal, right after its point's text in the same style (S3, Rans) */}
            {step.pointNote?.after === i + 1 && <> <span data-point-note>{step.pointNote.text}</span></>}
          </li>
        ))}
      </ol>
    ));
  }
  if (step.after) parts.push((gap) => <p key="after" className={gap}>{step.after}</p>);
  if (step.note) parts.push((gap) => <p key="note" className={`${gap ? `${gap} ` : ""}text-muted`}>{step.note}</p>);
  return <>{parts.map((part, i) => part(i > 0 ? "mt-2" : undefined))}</>;
}

/**
 * The card itself. `onDismiss` is the × button, `footer` the Step n of N row
 * with Back and Next, and `tooltipProps` react-joyride's.
 */
/* eslint-disable react/forbid-elements -- react-joyride tooltip controls: the tour library owns these elements' props and behaviour */
export default function TourCard({ tooltipProps, title, children, footer, onDismiss }) {
  return (
    <div
      {...tooltipProps}
      data-tour-card
      className="bg-surface rounded-card p-5 shadow-2xl w-[320px] max-w-[calc(100vw-32px)] max-h-[min(var(--tour-max-h,100vh),calc(100vh-32px))] supports-[height:100svh]:max-h-[min(var(--tour-max-h,100svh),calc(100svh-32px))] flex flex-col border border-line font-sans z-[10000]"
    >
      <div className="shrink-0 flex justify-between items-start mb-2">
        {title ? <h3 className="font-bold text-lg text-ink">{title}</h3> : <div />}
        <button
          onClick={(e) => {
            e.preventDefault();
            onDismiss();
          }}
          aria-label="Dismiss tour"
          className="text-subtle hover:text-body transition-colors duration-300 bg-surface-subtle hover:bg-line-card rounded-full shrink-0 w-6 h-6 flex items-center justify-center -mr-2 -mt-2"
        >
          ×
        </button>
      </div>
      {/* 16 px to the footer, its mt-4 alone: a mb-5 here as well left 36 px (Rans, 5 Nov 2026) */}
      <div data-tour-body className="min-h-0 overflow-y-auto overscroll-contain text-body text-sm leading-relaxed">
        {children}
      </div>
      <div className="shrink-0 flex justify-between items-center mt-4">
        {footer}
      </div>
    </div>
  );
}
