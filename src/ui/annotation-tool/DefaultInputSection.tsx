import React, { useState, useEffect, useRef } from "react";
import { NOT_AN_OBJECT, getSuggestionPanelMode } from "@/util/suggestionJudgment";

const OBSTRUCTION_OPTIONS = [
  { value: "bench", label: "Bench" },
  { value: "bicycle", label: "Bicycle" },
  { value: "bollard", label: "Bollard" },
  { value: "car", label: "Car" },
  { value: "construction_materials", label: "Construction Materials" },
  { value: "electrical_box", label: "Electrical Box" },
  { value: "fire_hydrant", label: "Fire Hydrant" },
  { value: "garbage", label: "Garbage" },
  { value: "lamp_post", label: "Lamp Post" },
  { value: "motorcycle", label: "Motorcycle" },
  { value: "movable_signage", label: "Movable Signage" },
  { value: "potted_plant", label: "Potted Plant" },
  { value: "street_sign", label: "Street Sign" },
  { value: "street_vendor_cart", label: "Street Vendor Cart" },
  { value: "trash_bin", label: "Trash Bin" },
  { value: "tree", label: "Tree" },
  { value: "tricycle", label: "Tricycle" },
  { value: "utility_post", label: "Utility Post" },
];

const SEVERITY_LEVELS = [
  { value: 1, label: "Minor inconvenience" },
  { value: 2, label: "Noticeable reduction" },
  { value: 3, label: "Significant narrowing" },
  { value: 4, label: "Difficult to pass" },
  { value: 5, label: "Impassable" },
];

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
  editable: boolean;
  selected: boolean;
  isRejected: boolean;
  obstructs?: boolean;
  severity?: number | null;
  // False for annotators, who give no severity (decided 3 Oct 2026)
  askSeverity?: boolean;
}

function SeveritySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [local, setLocal] = useState(value);
  const committedRef = useRef(false);

  useEffect(() => { setLocal(value); }, [value]);

  return (
    <div
      className="w-full"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
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
        <span className="text-xs font-semibold text-primary">{local} — {SEVERITY_LEVELS.find(l => l.value === local)?.label}</span>
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
    <div
      className="bg-surface rounded-control shadow-2xl border border-line p-4 w-[260px] pointer-events-auto"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
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

function CategoryDropdown({
  value,
  isCustom,
  setIsCustom,
  onChange,
  showNotAnObject,
}: {
  value: string;
  isCustom: boolean;
  setIsCustom: (v: boolean) => void;
  onChange: (v: string) => void;
  showNotAnObject: boolean;
}) {
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedVal = e.target.value;
    if (selectedVal === "OTHER_CUSTOM") {
      setIsCustom(true);
      onChange("");
    } else if (selectedVal === NOT_AN_OBJECT) {
      setIsCustom(false);
      onChange(NOT_AN_OBJECT);
    } else {
      setIsCustom(false);
      onChange(selectedVal);
    }
  };

  if (isCustom) {
    return (
      <input
        autoFocus
        className="w-full bg-surface-subtle border border-line rounded-control px-3 py-2 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder-gray-400"
        placeholder="Type label name..."
        value={value === "---" ? "" : value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div className="relative w-full">
      <select
        className="w-full bg-surface-subtle border border-line rounded-control px-3 py-2 pr-8 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
        value={value === NOT_AN_OBJECT ? NOT_AN_OBJECT : (value || "---")}
        onChange={handleSelectChange}
      >
        <option value="---" disabled>
          Select your option
        </option>
        {OBSTRUCTION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        <option value="OTHER_CUSTOM" style={{ fontWeight: "bold" }}>
          Other...
        </option>
        {showNotAnObject && (
          <option value={NOT_AN_OBJECT} style={{ fontWeight: "bold" }}>
            Not an object (wrong box)
          </option>
        )}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </div>
    </div>
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
  editable,
  selected,
  obstructs,
  severity,
  askSeverity = true,
}: IDefaultInputSection) => {
  const [isCustom, setIsCustom] = useState(false);

  useEffect(() => {
    if (value === NOT_AN_OBJECT) {
      setIsCustom(false);
      return;
    }

    const exactMatch = OBSTRUCTION_OPTIONS.find((opt) => opt.value === value);

    if (exactMatch) {
      setIsCustom(false);
      return;
    }

    const fuzzyMatch = OBSTRUCTION_OPTIONS.find(
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

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedVal = e.target.value;
    if (selectedVal === "OTHER_CUSTOM") {
      setIsCustom(true);
      onChange("");
    } else {
      onChange(selectedVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onSelectObstruction();
    }
  };

  const mode = getSuggestionPanelMode({ editable, selected, obstructs, severity, comment: value, askSeverity });

  if (mode === "severity") {
    return (
      <SeverityPicker
        initialValue={severity}
        onConfirm={onSetSeverity}
        onBack={onUnselectObstruction}
      />
    );
  }

  if (mode === "not_an_object") {
    return (
      <div
        className="bg-surface rounded-control shadow-2xl border border-line p-4 w-[260px] pointer-events-auto"
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className="mb-3">
          <CategoryDropdown
            value={value}
            isCustom={isCustom}
            setIsCustom={setIsCustom}
            onChange={onChange}
            showNotAnObject={true}
          />
        </div>
        <p className="text-xs text-muted mb-3 text-center">
          This box does not mark a real object. It will be left out of the data.
        </p>
        <button
          className="w-full py-2 rounded-control font-bold text-sm transition-all shadow-sm border border-line bg-surface-subtle hover:bg-line text-body"
          onClick={() => onMarkNotAnObject()}
        >
          Confirm: not an object
        </button>
      </div>
    );
  }

  if (mode === "drawn" || mode === "confirmed") {
    const deleteAction = editable ? onDelete : onUnselectObstruction;

    return (
      <div
        className="bg-surface rounded-control shadow-2xl border border-line p-2 w-[280px] pointer-events-auto"
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        {/* Label picker */}
        <div className="flex items-center gap-2">
          {isCustom ? (
            <input
              autoFocus
              className="flex-1 min-w-0 bg-surface-subtle border border-line rounded-control px-3 py-2 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder-gray-400"
              placeholder="Type label name..."
              value={value === "---" ? "" : value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <div className="relative flex-1 min-w-0">
              <select
                className="w-full bg-surface-subtle border border-line rounded-control px-3 py-2 pr-8 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
                value={value || "---"}
                onChange={handleSelectChange}
              >
                <option value="---" disabled>
                  Select your option
                </option>
                {OBSTRUCTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
                <option value="OTHER_CUSTOM" style={{ fontWeight: "bold" }}>
                  Other...
                </option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          )}

          <button
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-control bg-blue-50 hover:bg-blue-100 text-primary transition-colors shadow-sm border border-blue-200"
            onClick={() => onSelectObstruction()}
            title="Confirm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
          </button>

          <button
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-control bg-surface-subtle hover:bg-line text-body transition-colors shadow-sm border border-line"
            onClick={() => deleteAction()}
            title="Delete / Reject"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>

        {/* Obstruction question for a drawn box, asked of every box like the
            suggestions (thesis Chapter 4). Waits for a category. */}
        {editable && (() => {
          const hasCategory = Boolean(value) && value !== "---";
          const answerClass = (active: boolean) =>
            `flex-1 py-1.5 rounded-control font-bold text-sm transition-all shadow-sm border disabled:opacity-50 disabled:cursor-not-allowed ${active
              ? "border-primary bg-primary text-white"
              : "border-line bg-surface-subtle hover:bg-line text-body"
            }`;
          return (
            <div className="mt-2 pt-2 border-t border-line px-1">
              <p className="text-sm font-semibold text-ink mb-2 text-center">
                Does <span className="text-primary">{hasCategory ? translateValue(value) : "this object"}</span> obstruct the sidewalk?
              </p>
              <div className="flex gap-2">
                <button
                  className={answerClass(obstructs === true)}
                  disabled={!hasCategory}
                  aria-pressed={obstructs === true}
                  onClick={() => onSetObstructs(true)}
                >
                  Yes
                </button>
                <button
                  className={answerClass(obstructs === false)}
                  disabled={!hasCategory}
                  aria-pressed={obstructs === false}
                  onClick={() => onSetObstructs(false)}
                >
                  No
                </button>
              </div>
            </div>
          );
        })()}

        {/* Severity for a drawn box answered Yes (contributors only) */}
        {editable && askSeverity && obstructs === true && (
          <div className="mt-2 pt-2 border-t border-line px-1">
            <p className="text-xs text-muted mb-1.5 text-center">Severity:</p>
            <SeveritySlider value={severity ?? 3} onChange={onSetSeverity} />
          </div>
        )}

        {/* Editable severity for already-confirmed model suggestions */}
        {!editable && askSeverity && severity != null && (
          <div className="mt-2 pt-2 border-t border-line px-1">
            <p className="text-xs text-muted mb-1.5 text-center">Severity:</p>
            <SeveritySlider value={severity} onChange={onSetSeverity} />
          </div>
        )}
      </div>
    );
  }

  // "judge" mode — untouched suggestion or one answered No
  return (
    <div
      className="bg-surface rounded-control shadow-2xl border border-line p-4 w-[260px] pointer-events-auto"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <div className="mb-3">
        <CategoryDropdown
          value={value}
          isCustom={isCustom}
          setIsCustom={setIsCustom}
          onChange={onChange}
          showNotAnObject={true}
        />
      </div>
      <p className="text-sm font-semibold text-ink mb-3 text-center">Does <span className="text-primary">{translateValue(value)}</span> obstruct the sidewalk?</p>
      <div className="flex gap-2">
        <button
          className="flex-1 py-2 rounded-control font-bold text-sm transition-all shadow-sm border border-blue-200 bg-blue-50 hover:bg-blue-100 text-primary"
          onClick={() => onSelectObstruction()}
        >
          Yes
        </button>
        <button
          className="flex-1 py-2 rounded-control font-bold text-sm transition-all shadow-sm border bg-surface-subtle border-line hover:bg-surface-subtle text-body"
          onClick={() => onUnselectObstruction()}
        >
          No
        </button>
      </div>
    </div>
  );
};

const translateValue = (value: string) => {
  if (value === NOT_AN_OBJECT) return "Not an object";
  const standard = OBSTRUCTION_OPTIONS.find((opt) => opt.value === value);
  if (standard) return standard.label;
  if (value && value !== "---") return value;
  return value;
};

export default DefaultInputSection;
