import React, { useState, useEffect, useRef } from "react";
import { NOT_AN_OBJECT, getSuggestionPanelMode } from "@/util/suggestionJudgment";
import { CATEGORY_OPTIONS } from "@/util/categoryOptions";
import { BOX_VISIBILITY_COPY } from "@/features/annotate/boxVisibility";
import { SIDEWALK_QUESTION_COPY } from "@/features/annotate/sidewalkQuestionCopy";
import { EyeOffIcon } from "../icons";
import { proposalHintText } from "@/util/modelProposal";

/**
 * The box panel for contributors, Step 1.
 *
 * One panel for every box (7 Oct 2026): pick or check the category, then answer
 * Yes or No. No closes the panel. Yes opens the severity picker, and confirming
 * a severity closes it. A suggestion and a box the contributor drew behave the
 * same way, except that a drawn box can be deleted and a suggestion can be
 * marked Not an object, each from a button at the foot of the panel. The panel
 * offered a close button only once the box was fully answered, so a new box
 * was never left half done by accident (see S17 below for where it is now).
 *
 * From 2 Nov 2026 (S12) the panel first asks whether the object is on the
 * sidewalk or the path people walk on, with the same Yes and No buttons. No
 * closes the panel and the box leaves the photo. Yes moves on to the
 * obstruction question.
 *
 * Changing an answer (S17, 4 Nov 2026, option B of three, decided by Rans): a
 * confirmed obstruction opens on its severity scale, which saves when the
 * slider is let go, with no Confirm. Its footer has Back to Question 2, and
 * Question 2's footer has Back to Question 1. Going back is a view change
 * held in this panel's state, never in the box: the earlier question shows
 * with its answer chosen, and nothing changes until a different answer is
 * picked there. Not an object is offered on Question 1 only. A drawn box
 * keeps Delete box on every level. No contributor panel has a close button
 * (Rans, 4 Nov 2026): a click or a tap on the photo away from the box closes
 * it. Without the path question the close button is as it was.
 *
 * S18 (4 Nov 2026, pilot participant 4): each question, the severity
 * panel's and the picker's included, is 16 px semibold ink, the size of the
 * category chooser, and Not an object and Delete box are red outline buttons.
 *
 * The classifier's proposal (S3, 6 Nov 2026): once a suggestion's record
 * proposes that it obstructs, Question 2 shows one small muted line between
 * the question and Yes and No, "The model thinks this obstructs the
 * sidewalk." A proposal that it does not obstruct shows nothing (6 Nov
 * 2026). Only on Question 2: not on Question 1,
 * the severity picker or panel, a drawn box or a Not an object panel. Neither
 * button is chosen or moved because of it, and the probability is never shown.
 *
 * Two variants (9 Oct 2026): "floating", the card beside the box on the
 * desktop photo, and "sheet", the same panel in the answers sheet on a phone
 * or tablet: full width with no shadow, every button at least 44 px tall, and
 * 16 px text in the category list and the "Other..." field, so iOS does not
 * zoom the page when one is focused.
 */
const SEVERITY_LEVELS = [
  { value: 1, label: "Minor inconvenience" },
  { value: 2, label: "Noticeable reduction" },
  { value: 3, label: "Significant narrowing" },
  { value: 4, label: "Difficult to pass" },
  { value: 5, label: "Impassable" },
];

export const severityLabel = (value: number | null | undefined) =>
  SEVERITY_LEVELS.find((l) => l.value === value)?.label ?? "";

export interface IDefaultInputSection {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onDelete: () => void;
  onSelectObstruction: () => void;
  onUnselectObstruction: () => void;
  onMarkNotAnObject: () => void;
  onSetSeverity: (severity: number) => void;
  onSetObstructs: (obstructs: boolean) => void;
  /** Closes the panel without changing the box */
  onClose: () => void;
  /** Takes back a Yes that has no severity yet, back to the question */
  onClearObstruction: () => void;
  /** Restores a box marked Not an object: the model's category back, no answer */
  onRestoreObject: () => void;
  /** The model's own category for a suggestion, named in the Not an object panel */
  originalComment?: string;
  editable: boolean;
  selected: boolean;
  isRejected: boolean;
  obstructs?: boolean | null;
  severity?: number | null;
  // False for annotators, who give no severity (decided 3 Oct 2026)
  askSeverity?: boolean;
  /** Where the panel is shown: beside the box, or in the answers sheet (9 Oct 2026) */
  variant?: PanelVariant;
  /** Hides this box on the photo, which closes the panel (10 Oct 2026). No button without it. */
  onHide?: () => void;
  /** The sidewalk answer (S12): true, false, or none yet */
  onSidewalk?: boolean | null;
  /** Answers the sidewalk question. No also closes the panel. */
  onSetOnSidewalk?: (onSidewalk: boolean) => void;
  /** A confirmed obstruction's new severity, from its severity scale (S17). Leaves the panel open. */
  onChangeSeverity?: (severity: number) => void;
  /** False only where no sidewalk question is asked */
  askOnSidewalk?: boolean;
  /**
   * The classifier's proposal for a suggestion (S3), from the image record:
   * true, false, or none. Shown as a hint on Question 2 only, never as an answer.
   */
  proposedObstructs?: boolean | null;
}

export type PanelVariant = "floating" | "sheet";

const PANEL_CLASS = "bg-surface rounded-control shadow-2xl border border-line p-3 w-[280px] pointer-events-auto";
const SHEET_PANEL_CLASS = "bg-surface px-1 py-2 w-full pointer-events-auto";
const SECONDARY_BUTTON = "px-2.5 py-1.5 rounded-control text-xs font-semibold border border-line bg-surface-subtle text-ink hover:bg-line transition-colors";
// At least 44 px tall in the sheet (Apple HIG, Material)
const TOUCH_TARGET = "min-h-[44px]";
const panelClass = (variant: PanelVariant) => (variant === "sheet" ? SHEET_PANEL_CLASS : PANEL_CLASS);
const secondaryButton = (variant: PanelVariant) => (variant === "sheet" ? `${SECONDARY_BUTTON} ${TOUCH_TARGET} px-3.5` : SECONDARY_BUTTON);
// Not an object and Delete box (S18, 4 Nov 2026): red outline, the same size
// as the grey button, so they read as "remove" and not as the main action
const DANGER_BUTTON = "px-2.5 py-1.5 rounded-control text-xs font-semibold border border-danger/50 bg-surface text-danger hover:bg-danger/10 transition-colors";
const dangerButton = (variant: PanelVariant) => (variant === "sheet" ? `${DANGER_BUTTON} ${TOUCH_TARGET} px-3.5` : DANGER_BUTTON);
// The question on every panel (S18): the category chooser's 16 px, so it is
// the panel's most prominent text. Its "Question 1 of 2" line stays small.
const QUESTION_TEXT = "text-base font-semibold text-ink";
const stop = (e: React.MouseEvent) => e.stopPropagation();

// The keys that move a range input
const SLIDER_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];

/**
 * `onRelease` (S17): the value when the slider is let go, on pointer up, touch
 * end or the release of a key that moves it, not on every step of a drag.
 * Several of these fire for one release, so the caller drops repeats.
 */
function SeveritySlider({ value, onChange, onRelease }: { value: number; onChange: (v: number) => void; onRelease?: (v: number) => void }) {
  const [local, setLocal] = useState(value);
  const committedRef = useRef(false);
  const release = (e: React.SyntheticEvent<HTMLInputElement>) => onRelease?.(Number(e.currentTarget.value));

  useEffect(() => { setLocal(value); }, [value]);

  return (
    <div className="w-full" onMouseDown={stop} onMouseUp={stop}>
      <style>{`
        .severity-range { -webkit-appearance: none; appearance: none; width: 100%; height: 8px; border-radius: 9999px; background: linear-gradient(to right, #dbeafe, #fde68a, #fca5a5); outline: none; cursor: pointer; }
        .severity-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%; background: var(--color-primary, #3b82f6); border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: grab; }
        .severity-range::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.15); }
        .severity-range::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: var(--color-primary, #3b82f6); border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: grab; }
        .severity-range::-moz-range-thumb:active { cursor: grabbing; }
        @media (pointer: coarse) {
          .severity-range::-webkit-slider-thumb { width: 32px; height: 32px; }
          .severity-range::-moz-range-thumb { width: 32px; height: 32px; }
        }
      `}</style>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={local}
        aria-label="Severity"
        data-control="severity"
        aria-valuetext={`${local}, ${severityLabel(local)}`}
        className="severity-range"
        onInput={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          setLocal(v);
          committedRef.current = false;
        }}
        onChange={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          setLocal(v);
          if (!committedRef.current) { committedRef.current = true; onChange(v); }
        }}
        onMouseUp={(e) => { committedRef.current = true; onChange(local); release(e); }}
        onPointerUp={release}
        onTouchEnd={release}
        onKeyUp={(e) => { if (SLIDER_KEYS.includes(e.key)) release(e); }}
      />
      <div className="flex justify-between items-center mt-1">
        <span className="text-[10px] text-muted">1</span>
        <span className="text-xs font-semibold text-primary">{local} · {severityLabel(local)}</span>
        <span className="text-[10px] text-muted">5</span>
      </div>
    </div>
  );
}

export function SeverityPicker({ initialValue, onConfirm, onBack, variant = "floating" }: {
  initialValue: number | null | undefined;
  onConfirm: (severity: number) => void;
  onBack: () => void;
  variant?: PanelVariant;
}) {
  const [localSeverity, setLocalSeverity] = useState(initialValue ?? 3);
  const sheet = variant === "sheet";

  return (
    <div
      className={sheet ? "bg-surface px-1 py-2 w-full pointer-events-auto" : "bg-surface rounded-control shadow-2xl border border-line p-4 w-[260px] pointer-events-auto"}
      onMouseDown={stop}
      onMouseUp={stop}
    >
      <p className={`${QUESTION_TEXT} mb-3 text-center`}>How severe is this obstruction?</p>
      <SeveritySlider value={localSeverity} onChange={setLocalSeverity} />
      <button
        data-control="confirm"
        className={`w-full mt-3 py-2 rounded-control text-sm font-bold transition-all border border-primary bg-primary/10 text-primary hover:bg-primary/20${sheet ? ` ${TOUCH_TARGET}` : ""}`}
        onClick={() => onConfirm(localSeverity)}
      >
        Confirm
      </button>
      <button
        className={`w-full mt-1 py-1.5 rounded-control text-xs font-medium text-muted hover:text-body transition-colors${sheet ? ` ${TOUCH_TARGET}` : ""}`}
        onClick={onBack}
      >
        Go back
      </button>
    </div>
  );
}

/**
 * Hides the open box on the photo (10 Oct 2026), so crowded boxes can be
 * fitted without going down to the lists for its eye. Shown again from its
 * chip.
 */
export function HideButton({ onHide, variant = "floating" }: { onHide: () => void; variant?: PanelVariant }) {
  return (
    <button
      className={`shrink-0 ${variant === "sheet" ? "w-11 h-11" : "w-9 h-9"} grid place-items-center rounded-control text-muted hover:text-ink hover:bg-surface-subtle transition-colors`}
      onClick={() => onHide()}
      title={BOX_VISIBILITY_COPY.hideOpen}
      aria-label={BOX_VISIBILITY_COPY.hideOpen}
    >
      <EyeOffIcon size={16} />
    </button>
  );
}

function CloseButton({ onClose, variant = "floating" }: { onClose: () => void; variant?: PanelVariant }) {
  return (
    <button
      className={`shrink-0 ${variant === "sheet" ? "w-11 h-11" : "w-9 h-9"} grid place-items-center rounded-control text-muted hover:text-ink hover:bg-surface-subtle transition-colors`}
      onClick={() => onClose()}
      title="Close"
      aria-label="Close"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
}

/** The category list, plus "Other..." for a label typed in. Not an object is a button, not a category. */
function CategoryField({ value, isCustom, setIsCustom, onChange, variant = "floating" }: {
  value: string;
  isCustom: boolean;
  setIsCustom: (v: boolean) => void;
  onChange: (v: string) => void;
  variant?: PanelVariant;
}) {
  // 16 px in the sheet: iOS zooms the page when a field under 16 px is focused
  const textSize = variant === "sheet" ? `text-base ${TOUCH_TARGET}` : "text-sm";
  if (isCustom) {
    return (
      <input
        autoFocus
        className={`flex-1 min-w-0 bg-surface-subtle border border-line rounded-control px-3 py-2 ${textSize} font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder-gray-400`}
        placeholder="Type label name..."
        value={value === "---" ? "" : value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div className="relative flex-1 min-w-0">
      <select
        aria-label="Category"
        data-control="category"
        className={`w-full bg-surface-subtle border border-line rounded-control px-3 py-2 pr-8 ${textSize} font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer`}
        value={value && value !== NOT_AN_OBJECT ? value : "---"}
        onChange={(e) => {
          if (e.target.value === "OTHER_CUSTOM") {
            setIsCustom(true);
            onChange("");
          } else {
            setIsCustom(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="---" disabled>
          Select a category
        </option>
        {CATEGORY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        <option value="OTHER_CUSTOM">Other...</option>
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </div>
    </div>
  );
}

function AnswerButton({ active, disabled, onClick, children, variant = "floating", control }: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant?: PanelVariant;
  /** data-control, which the landing page's preview finds the button by */
  control?: string;
}) {
  return (
    <button
      data-control={control}
      className={`py-2${variant === "sheet" ? ` ${TOUCH_TARGET}` : ""} rounded-control text-sm font-bold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${active
        ? "border-primary bg-primary text-white"
        : "border-line bg-surface text-ink hover:bg-surface-subtle"
        }`}
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const DefaultInputSection = ({
  value,
  onChange,
  onDelete,
  onSelectObstruction,
  onUnselectObstruction,
  onMarkNotAnObject,
  onSetSeverity,
  onSetObstructs,
  onClose,
  onClearObstruction,
  onRestoreObject,
  originalComment = "",
  editable,
  selected,
  isRejected,
  obstructs,
  severity,
  askSeverity = true,
  variant = "floating",
  onHide,
  onSidewalk,
  onSetOnSidewalk = () => undefined,
  onChangeSeverity = () => undefined,
  askOnSidewalk = true,
  proposedObstructs = null,
}: IDefaultInputSection) => {
  // A typed-in label opens as the "Other..." field straight away
  const [isCustom, setIsCustom] = useState(() => isCustomLabel(value));
  // Back to Question 1 or 2 (S17): which earlier question is on screen, or
  // null for the box's deepest answered level. A view only, never the box's
  // data. The panel is keyed by box, so it resets when another box opens.
  const [back, setBack] = useState<1 | 2 | null>(null);

  useEffect(() => {
    if (value === NOT_AN_OBJECT) {
      setIsCustom(false);
      return;
    }

    const exactMatch = CATEGORY_OPTIONS.find((opt) => opt.value === value);

    if (exactMatch) {
      setIsCustom(false);
      return;
    }

    const fuzzyMatch = CATEGORY_OPTIONS.find(
      (opt) =>
        opt.label.toLowerCase() === value.toLowerCase() ||
        opt.value.replace(/_/g, " ") === value.toLowerCase()
    );

    if (fuzzyMatch) {
      onChange(fuzzyMatch.value);
      setIsCustom(false);
    } else if (value && value !== "---") {
      setIsCustom(true);
    } else if (value === "---") {
      setIsCustom(false);
    }
  }, [value, onChange]);

  const mode = getSuggestionPanelMode({ editable, selected, obstructs, severity, comment: value, onSidewalk: onSidewalk ?? undefined, askSeverity, askOnSidewalk });

  if (mode === "severity") {
    // A first Yes: Go back takes the Yes back, so nothing is recorded
    return <SeverityPicker initialValue={severity} onConfirm={onSetSeverity} onBack={onClearObstruction} variant={variant} />;
  }

  // Laid out like the question panel (8 Oct 2026): a title, one line on which
  // box this is, and the way back in the footer, mirroring "No real object in
  // this box?" there. Restore, not Undo, since the panel is often reopened
  // long after the box was marked. No close button for contributors (Rans,
  // 4 Nov 2026): a click or a tap on the photo closes it.
  if (mode === "not_an_object") {
    const suggested = originalComment && originalComment !== NOT_AN_OBJECT ? translateValue(originalComment) : "";
    return (
      <div className={panelClass(variant)} onMouseDown={stop} onMouseUp={stop}>
        <div className="flex items-center gap-2">
          <span className="flex-1 pl-1 text-sm font-semibold text-ink">Not an object</span>
          {onHide && <HideButton onHide={onHide} variant={variant} />}
          {!askOnSidewalk && <CloseButton onClose={onClose} variant={variant} />}
        </div>
        <span className="block px-1 text-xs text-muted">
          {suggested ? `Suggested as ${suggested}. ` : ""}This box won&apos;t be counted.
        </span>
        <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-2">
          <span className="text-xs text-muted">A real object after all?</span>
          <button className={secondaryButton(variant)} onClick={() => onRestoreObject()}>
            Restore
          </button>
        </div>
      </div>
    );
  }

  const hasCategory = Boolean(value) && value !== "---";
  const label = hasCategory ? translateValue(value) : "this object";
  const header = <CategoryField value={value} isCustom={isCustom} setIsCustom={setIsCustom} onChange={onChange} variant={variant} />;
  const footer = <PanelFooter editable={editable} variant={variant} onDelete={onDelete} onMarkNotAnObject={onMarkNotAnObject} />;

  // "sidewalk": the first question (S12). Answered No, the box is reopened
  // from its chip under Not obstructions, so No shows chosen. No close button
  // (Rans, 4 Nov 2026): a click or a tap on the photo closes the panel.
  if (mode === "sidewalk") {
    const answer = onSidewalk === false ? "no" : null;
    return (
      <QuestionPanel
        variant={variant}
        header={header}
        onHide={onHide}
        question={SIDEWALK_QUESTION_COPY.question}
        step={1}
        answer={answer}
        disabled={!hasCategory}
        onYes={() => onSetOnSidewalk(true)}
        onNo={() => onSetOnSidewalk(false)}
        control="on-sidewalk"
        footer={footer}
      />
    );
  }

  // "judge", "confirmed" or "drawn": on the sidewalk, so the obstruction question
  const answer = editable
    ? obstructs === true ? "yes" : obstructs === false ? "no" : null
    : selected ? "yes" : isRejected ? "no" : null;
  const answered = answer === "no" || (answer === "yes" && (!askSeverity || severity != null));
  // A confirmed obstruction opens on its severity scale (S17)
  const confirmed = answer === "yes" && askSeverity && severity != null;
  const view = back === 1 && askOnSidewalk ? 1 : back === 2 || !confirmed ? 2 : "severity";
  // Delete box on the right of every footer for a drawn box
  const deleteBox = editable ? <DeleteBoxButton variant={variant} onDelete={onDelete} /> : null;

  // Back to Question 1: Question 1 with its Yes chosen. Yes goes back to the
  // deepest level with nothing changed (never onSetOnSidewalk(true), which
  // would clear Question 2). No is Question 1's No: the box leaves the photo.
  // No close button (Rans, 4 Nov 2026): a click or a tap on the photo closes
  // the panel, changing nothing.
  if (view === 1) {
    return (
      <QuestionPanel
        variant={variant}
        header={header}
        onHide={onHide}
        question={SIDEWALK_QUESTION_COPY.question}
        step={1}
        answer="yes"
        disabled={!hasCategory}
        onYes={() => setBack(null)}
        onNo={() => onSetOnSidewalk(false)}
        control="on-sidewalk"
        footer={footer}
      />
    );
  }

  if (view === "severity") {
    return (
      <SeverityPanel
        variant={variant}
        header={header}
        onHide={onHide}
        severity={severity!}
        onChangeSeverity={onChangeSeverity}
        footer={<><BackButton to={2} variant={variant} onClick={() => setBack(2)} />{deleteBox}</>}
      />
    );
  }

  const onYes = () => {
    if (answer === "yes") {
      // A confirmed obstruction (reached with Back to Question 2): back to its
      // severity with nothing changed. Without a severity to ask, done.
      if (askSeverity) setBack(null);
      else onClose();
      return;
    }
    if (editable) onSetObstructs(true);
    else onSelectObstruction();
  };

  // The classifier's proposal (S3): a suggestion's, at Question 2 for
  // contributors only. A drawn box has none, whatever it is given.
  const hint = askOnSidewalk && !editable ? proposalHintText(proposedObstructs) : null;

  const onNo = () => {
    if (editable) {
      onSetObstructs(false);
      onClose();
    } else {
      onUnselectObstruction();
    }
  };

  return (
    <QuestionPanel
      variant={variant}
      header={header}
      onHide={onHide}
      // Contributors close it with a click on the photo (Rans, 4 Nov 2026).
      // Without the path question, the close button as before.
      onClose={!askOnSidewalk && answered ? onClose : undefined}
      // The category in bold within the semibold question (S18)
      question={<>Does <span className="font-bold">{label}</span> obstruct the sidewalk?</>}
      // Second of the two only when the path question was asked (contributors)
      step={askOnSidewalk ? 2 : undefined}
      note={hint}
      answer={answer}
      disabled={!hasCategory}
      onYes={onYes}
      onNo={onNo}
      // Contributors: Back to Question 1, and no Not an object past Question 1
      // (S17). Without the path question the footer is as it was.
      footer={askOnSidewalk ? <><BackButton to={1} variant={variant} onClick={() => setBack(1)} />{deleteBox}</> : footer}
    />
  );
};

/**
 * A confirmed obstruction reopened (S17, 4 Nov 2026): the category with the
 * eye, as on the question panels, then its severity scale at the stored
 * value. No close button, as on Question 2. Letting go of the slider at a different value
 * saves it and the panel stays open on the new value. No Confirm and no
 * Change. The first severity still comes from SeverityPicker.
 */
function SeverityPanel({ variant, header, onHide, severity, onChangeSeverity, footer }: {
  variant: PanelVariant;
  header: React.ReactNode;
  onHide?: () => void;
  severity: number;
  onChangeSeverity: (severity: number) => void;
  footer: React.ReactNode;
}) {
  // The value last saved, so the several events of one release save once
  const saved = useRef(severity);
  useEffect(() => { saved.current = severity; }, [severity]);
  const onRelease = (v: number) => {
    if (v === saved.current) return;
    saved.current = v;
    onChangeSeverity(v);
  };

  return (
    <div className={panelClass(variant)} onMouseDown={stop} onMouseUp={stop} data-severity-panel>
      <div className="flex items-center gap-2">
        {header}
        {onHide && <HideButton onHide={onHide} variant={variant} />}
      </div>
      <p className={`${QUESTION_TEXT} mt-3 mb-3`}>How severe is this obstruction?</p>
      <SeveritySlider value={severity} onChange={() => undefined} onRelease={onRelease} />
      <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-2">
        {footer}
      </div>
    </div>
  );
}

/**
 * Back to an earlier question (S17): plain text on the left of the footer, as
 * the severity picker's Go back is styled, with an arrow that is not read out.
 */
function BackButton({ to, variant, onClick }: { to: 1 | 2; variant: PanelVariant; onClick: () => void }) {
  return (
    <button
      data-control={`back-to-question-${to}`}
      className={`inline-flex items-center gap-1 py-1.5 text-left text-xs font-medium text-muted hover:text-body transition-colors${variant === "sheet" ? ` ${TOUCH_TARGET}` : ""}`}
      onClick={onClick}
    >
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" d="M15 18l-6-6 6-6" /></svg>
      {SIDEWALK_QUESTION_COPY.backTo(to)}
    </button>
  );
}

function DeleteBoxButton({ variant, onDelete }: { variant: PanelVariant; onDelete: () => void }) {
  return (
    <button className={dangerButton(variant)} onClick={() => onDelete()}>
      Delete box
    </button>
  );
}

/**
 * A Yes or No question about the box: the category with the eye and the close
 * button, the question, Yes and No, and the footer. The sidewalk question and
 * the obstruction question share it (S12), so both look the same. The buttons'
 * data-control is `control` with -yes and -no, or yes and no without it, which
 * the landing page's preview finds them by.
 *
 * `step` (S16, 3 Nov 2026): the first pilot participants took the first Yes
 * or No for the obstruction question, so for contributors a small line above
 * the question says which of the two it is. No line without it.
 */
function QuestionPanel({ variant, header, onHide, onClose, question, step, note, answer, disabled, onYes, onNo, control, footer }: {
  variant: PanelVariant;
  header: React.ReactNode;
  onHide?: () => void;
  /** No close button without it */
  onClose?: () => void;
  question: React.ReactNode;
  /** 1 or 2: "Question 1 of 2" above the question */
  step?: 1 | 2;
  /** A small muted line between the question and Yes and No (S3: the model's proposal). None without it. */
  note?: string | null;
  answer: "yes" | "no" | null;
  disabled: boolean;
  onYes: () => void;
  onNo: () => void;
  control?: string;
  footer: React.ReactNode;
}) {
  return (
    <div className={panelClass(variant)} onMouseDown={stop} onMouseUp={stop}>
      <div className="flex items-center gap-2">
        {header}
        {onHide && <HideButton onHide={onHide} variant={variant} />}
        {onClose && <CloseButton onClose={onClose} variant={variant} />}
      </div>

      {step && <p data-question-step={step} className="text-xs font-semibold text-muted mt-3">{SIDEWALK_QUESTION_COPY.questionOf(step)}</p>}
      <p className={`${QUESTION_TEXT} ${step ? "mt-0.5" : "mt-3"} mb-2`}>{question}</p>
      {/* Smaller than the question, so it reads as a note (S3) */}
      {note && <p data-proposal-hint className="text-sm text-muted -mt-1 mb-2">{note}</p>}
      <div className="grid grid-cols-2 gap-2">
        <AnswerButton active={answer === "yes"} disabled={disabled} onClick={onYes} variant={variant} control={control ? `${control}-yes` : "yes"}>Yes</AnswerButton>
        <AnswerButton active={answer === "no"} disabled={disabled} onClick={onNo} variant={variant} control={control ? `${control}-no` : "no"}>No</AnswerButton>
      </div>

      <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-2">
        {footer}
      </div>
    </div>
  );
}

/** Question 1's footer (S17: and the obstruction question's without the path question): Delete box for a drawn box, Not an object for a suggestion */
function PanelFooter({ editable, variant, onDelete, onMarkNotAnObject }: {
  editable: boolean;
  variant: PanelVariant;
  onDelete: () => void;
  onMarkNotAnObject: () => void;
}) {
  return editable ? (
    <>
      <span className="text-xs text-muted">Drawn by you</span>
      <DeleteBoxButton variant={variant} onDelete={onDelete} />
    </>
  ) : (
    <>
      <span className="text-xs text-muted">No real object in this box?</span>
      <button className={dangerButton(variant)} onClick={() => onMarkNotAnObject()}>
        Not an object
      </button>
    </>
  );
}

/** A label typed in with "Other...": not empty, not Not an object, and not one of the categories. */
function isCustomLabel(value: string) {
  if (!value || value === "---" || value === NOT_AN_OBJECT) return false;
  const lower = value.toLowerCase();
  return !CATEGORY_OPTIONS.some(
    (opt) => opt.value === value || opt.label.toLowerCase() === lower || opt.value.replace(/_/g, " ") === lower
  );
}

const translateValue = (value: string) => {
  if (value === NOT_AN_OBJECT) return "Not an object";
  const standard = CATEGORY_OPTIONS.find((opt) => opt.value === value);
  if (standard) return standard.label;
  if (value && value !== "---") return value;
  return value;
};

export default DefaultInputSection;
