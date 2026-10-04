import React from "react";
import { CATEGORY_OPTIONS } from "@/util/categoryOptions";
import { isTaxonomyCategory } from "@/util/taxonomy";

/**
 * The box panel for annotators, Step 1 Objects (decided 4 Oct 2026).
 *
 * Annotators record boxes and categories only: each suggestion is kept or
 * marked Not an object, and each drawn box gets one of the 18 categories. There
 * is no Yes/No question, no severity and no free-text "Other" category, since
 * an "other" box cannot train an 18-class detector (chapter_4.tex line 59).
 *
 * Kept apart from DefaultInputSection (contributors) so that panel does not
 * grow more role branches. The mode comes from getObjectPanelMode.
 */
export type ObjectPanelMode = "decide" | "kept" | "not_an_object" | "drawn";

export interface IObjectInputSection {
  value: string;
  mode: ObjectPanelMode;
  onChange: (value: string) => void;
  onKeep: () => void;
  onMarkNotAnObject: () => void;
  onDelete: () => void;
  onClose: () => void;
  belowMinimumSize?: boolean;
}

const PANEL_CLASS = "bg-surface rounded-control shadow-2xl border border-line p-3 w-[280px] pointer-events-auto";

const stop = (e: React.MouseEvent) => e.stopPropagation();

function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Anything outside the 18 (an old free-text label, "---" or Not an object)
  // shows the placeholder, so a category has to be chosen
  return (
    <div className="relative flex-1 min-w-0">
      <select
        className="w-full bg-surface-subtle border border-line rounded-control px-3 py-2 pr-8 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
        value={isTaxonomyCategory(value) ? value : "---"}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="---" disabled>
          Select a category
        </option>
        {CATEGORY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </div>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      className="shrink-0 w-9 h-9 flex items-center justify-center rounded-control bg-blue-50 hover:bg-blue-100 text-primary transition-colors shadow-sm border border-blue-200"
      onClick={() => onClose()}
      title="Done"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
    </button>
  );
}

function NotAnObjectButton({ onMarkNotAnObject, className = "" }: { onMarkNotAnObject: () => void; className?: string }) {
  return (
    <button
      className={`py-2 px-3 rounded-control font-bold text-sm transition-all shadow-sm border border-line bg-surface-subtle hover:bg-line text-body ${className}`}
      onClick={() => onMarkNotAnObject()}
    >
      Not an object
    </button>
  );
}

const SizeNote = ({ show }: { show?: boolean }) =>
  show ? (
    <p className="text-xs text-muted mt-2">
      This box is smaller than about 20 by 20 pixels. Objects that small are not annotated.
    </p>
  ) : null;

const ObjectInputSection = ({
  value,
  mode,
  onChange,
  onKeep,
  onMarkNotAnObject,
  onDelete,
  onClose,
  belowMinimumSize = false,
}: IObjectInputSection) => {
  const hasCategory = isTaxonomyCategory(value);

  if (mode === "not_an_object") {
    return (
      <div className={PANEL_CLASS} onMouseDown={stop} onMouseUp={stop}>
        <p className="text-xs text-muted mb-2 text-center">
          This box does not mark a real object. It is left out of the data.
        </p>
        <CategorySelect value={value} onChange={onChange} />
      </div>
    );
  }

  if (mode === "decide") {
    return (
      <div className={PANEL_CLASS} onMouseDown={stop} onMouseUp={stop}>
        <CategorySelect value={value} onChange={onChange} />
        <SizeNote show={belowMinimumSize} />
        <p className="text-xs text-muted mt-2">Fix the box first if it is loose. Drag it or its corners.</p>
        <p className="text-xs text-muted mt-1 mb-3">
          Click Not an object if the box marks nothing real or repeats an object that already has a box.
        </p>
        <div className="flex gap-2">
          <button
            className="flex-1 py-2 rounded-control font-bold text-sm transition-all shadow-sm border border-primary bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!hasCategory}
            onClick={() => onKeep()}
          >
            Keep
          </button>
          <NotAnObjectButton onMarkNotAnObject={onMarkNotAnObject} className="flex-1" />
        </div>
      </div>
    );
  }

  // "kept" (a suggestion already kept) or "drawn" (a box the annotator drew)
  return (
    <div className={PANEL_CLASS} onMouseDown={stop} onMouseUp={stop}>
      <div className="flex items-center gap-2">
        <CategorySelect value={value} onChange={onChange} />
        <CloseButton onClose={onClose} />
        {mode === "drawn" && (
          <button
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-control bg-surface-subtle hover:bg-line text-body transition-colors shadow-sm border border-line"
            onClick={() => onDelete()}
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        )}
      </div>
      <SizeNote show={belowMinimumSize} />
      {mode === "kept" && (
        <NotAnObjectButton onMarkNotAnObject={onMarkNotAnObject} className="w-full mt-2" />
      )}
    </div>
  );
};

export default ObjectInputSection;
