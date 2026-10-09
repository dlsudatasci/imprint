import React, { useState, useEffect, useRef } from "react";
import { NOT_AN_OBJECT, getSuggestionPanelMode } from "@/util/suggestionJudgment";
import { CATEGORY_OPTIONS } from "@/util/categoryOptions";

/**
 * The box panel for contributors, Step 1.
 *
 * One panel for every box (7 Oct 2026): pick or check the category, then answer
 * Yes or No. No closes the panel. Yes opens the severity picker, and confirming
 * a severity closes it. A suggestion and a box the contributor drew behave the
 * same way, except that a drawn box can be deleted and a suggestion can be
 * marked Not an object, each from a button at the foot of the panel. The panel
 * offers a close button only once the box is fully answered, so a new box is
 * never left half done by accident.
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
}

const PANEL_CLASS = "bg-surface rounded-control shadow-2xl border border-line p-3 w-[280px] pointer-events-auto";
const SECONDARY_BUTTON = "px-2.5 py-1.5 rounded-control text-xs font-semibold border border-line bg-surface-subtle text-ink hover:bg-line transition-colors";
const stop = (e: React.MouseEvent) => e.stopPropagation();

function SeveritySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [local, setLocal] = useState(value);
  const committedRef = useRef(false);

  useEffect(() => { setLocal(value); }, [value]);

  return (
    <div className="w-full" onMouseDown={stop} onMouseUp={stop}>
      <style>{`
        .severity-range { -webkit-appearance: none; appearance: none; width: 100%; height: 8px; border-radius: 9999px; background: linear-gradient(to right, #dbeafe, #fde68a, #fca5a5); outline: none; cursor: pointer; }
        .severity-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%; background: var(--color-primary, #3b82f6); border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: grab; }
        .severity-range::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.15); }
        .severity-range::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: var(--color-primary, #3b82f6); border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: grab; }
        .severity-range::-moz-range-thumb:active { cursor: grabbing; }
      `}</style>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={local}
        aria-label="Severity"
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
        onMouseUp={() => { committedRef.current = true; onChange(local); }}
      />
      <div className="flex justify-between items-center mt-1">
        <span className="text-[10px] text-muted">1</span>
        <span className="text-xs font-semibold text-primary">{local} · {severityLabel(local)}</span>
        <span className="text-[10px] text-muted">5</span>
      </div>
    </div>
  );
}

function SeverityPicker({ initialValue, onConfirm, onBack }: {
  initialValue: number | null | undefined;
  onConfirm: (severity: number) => void;
  onBack: () => void;
}) {
  const [localSeverity, setLocalSeverity] = useState(initialValue ?? 3);

  return (
    <div className="bg-surface rounded-control shadow-2xl border border-line p-4 w-[260px] pointer-events-auto" onMouseDown={stop} onMouseUp={stop}>
      <p className="text-sm font-semibold text-ink mb-3 text-center">How severe is this obstruction?</p>
      <SeveritySlider value={localSeverity} onChange={setLocalSeverity} />
      <button
        className="w-full mt-3 py-2 rounded-control text-sm font-bold transition-all border border-primary bg-primary/10 text-primary hover:bg-primary/20"
        onClick={() => onConfirm(localSeverity)}
      >
        Confirm
      </button>
      <button
        className="w-full mt-1 py-1.5 rounded-control text-xs font-medium text-muted hover:text-body transition-colors"
        onClick={onBack}
      >
        Go back
      </button>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      className="shrink-0 w-9 h-9 grid place-items-center rounded-control text-muted hover:text-ink hover:bg-surface-subtle transition-colors"
      onClick={() => onClose()}
      title="Close"
      aria-label="Close"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
}

/** The category list, plus "Other..." for a label typed in. Not an object is a button, not a category. */
function CategoryField({ value, isCustom, setIsCustom, onChange }: {
  value: string;
  isCustom: boolean;
  setIsCustom: (v: boolean) => void;
  onChange: (v: string) => void;
}) {
  if (isCustom) {
    return (
      <input
        autoFocus
        className="flex-1 min-w-0 bg-surface-subtle border border-line rounded-control px-3 py-2 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder-gray-400"
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
        className="w-full bg-surface-subtle border border-line rounded-control px-3 py-2 pr-8 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
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

function AnswerButton({ active, disabled, onClick, children }: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`py-2 rounded-control text-sm font-bold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${active
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
}: IDefaultInputSection) => {
  const [isCustom, setIsCustom] = useState(false);
  // Changing the severity of a box already answered Yes
  const [adjustingSeverity, setAdjustingSeverity] = useState(false);

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

  const mode = getSuggestionPanelMode({ editable, selected, obstructs, severity, comment: value, askSeverity });

  if (mode === "severity") {
    // A first Yes: Go back takes the Yes back, so nothing is recorded
    return <SeverityPicker initialValue={severity} onConfirm={onSetSeverity} onBack={onClearObstruction} />;
  }

  if (adjustingSeverity) {
    return (
      <SeverityPicker
        initialValue={severity}
        onConfirm={(v) => { setAdjustingSeverity(false); onSetSeverity(v); }}
        onBack={() => setAdjustingSeverity(false)}
      />
    );
  }

  // Laid out like the question panel (8 Oct 2026): a title with the close
  // button, one line on which box this is, and the way back in the footer,
  // mirroring "No real object in this box?" there. Restore, not Undo, since
  // the panel is often reopened long after the box was marked.
  if (mode === "not_an_object") {
    const suggested = originalComment && originalComment !== NOT_AN_OBJECT ? translateValue(originalComment) : "";
    return (
      <div className={PANEL_CLASS} onMouseDown={stop} onMouseUp={stop}>
        <div className="flex items-center gap-2">
          <span className="flex-1 pl-1 text-sm font-semibold text-ink">Not an object</span>
          <CloseButton onClose={onClose} />
        </div>
        <span className="block px-1 text-xs text-muted">
          {suggested ? `Suggested as ${suggested}. ` : ""}This box won&apos;t be counted.
        </span>
        <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-2">
          <span className="text-xs text-muted">A real object after all?</span>
          <button className={SECONDARY_BUTTON} onClick={() => onRestoreObject()}>
            Restore
          </button>
        </div>
      </div>
    );
  }

  // "judge", "confirmed" or "drawn": the question
  const answer = editable
    ? obstructs === true ? "yes" : obstructs === false ? "no" : null
    : selected ? "yes" : isRejected ? "no" : null;
  const hasCategory = Boolean(value) && value !== "---";
  const answered = answer === "no" || (answer === "yes" && (!askSeverity || severity != null));

  const onYes = () => {
    if (answer === "yes") {
      if (askSeverity) setAdjustingSeverity(true);
      else onClose();
      return;
    }
    if (editable) onSetObstructs(true);
    else onSelectObstruction();
  };

  const onNo = () => {
    if (editable) {
      onSetObstructs(false);
      onClose();
    } else {
      onUnselectObstruction();
    }
  };

  return (
    <div className={PANEL_CLASS} onMouseDown={stop} onMouseUp={stop}>
      <div className="flex items-center gap-2">
        <CategoryField value={value} isCustom={isCustom} setIsCustom={setIsCustom} onChange={onChange} />
        {answered && <CloseButton onClose={onClose} />}
      </div>

      <p className="text-sm text-body mt-3 mb-2">
        Does <span className="font-semibold text-ink">{hasCategory ? translateValue(value) : "this object"}</span> obstruct the sidewalk?
      </p>
      <div className="grid grid-cols-2 gap-2">
        <AnswerButton active={answer === "yes"} disabled={!hasCategory} onClick={onYes}>Yes</AnswerButton>
        <AnswerButton active={answer === "no"} disabled={!hasCategory} onClick={onNo}>No</AnswerButton>
      </div>

      {/* The severity number only, styled like "Drawn by you". Its wording is on
          the picker. */}
      {answer === "yes" && askSeverity && severity != null && (
        <div className="flex items-center justify-between gap-2 mt-3">
          <span className="text-xs text-muted">Severity {severity}</span>
          <button className="text-xs font-semibold text-primary hover:underline" onClick={() => setAdjustingSeverity(true)}>
            Change
          </button>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-2">
        {editable ? (
          <>
            <span className="text-xs text-muted">Drawn by you</span>
            <button className={`${SECONDARY_BUTTON} hover:text-danger`} onClick={() => onDelete()}>
              Delete box
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-muted">No real object in this box?</span>
            <button className={SECONDARY_BUTTON} onClick={() => onMarkNotAnObject()}>
              Not an object
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const translateValue = (value: string) => {
  if (value === NOT_AN_OBJECT) return "Not an object";
  const standard = CATEGORY_OPTIONS.find((opt) => opt.value === value);
  if (standard) return standard.label;
  if (value && value !== "---") return value;
  return value;
};

export default DefaultInputSection;
