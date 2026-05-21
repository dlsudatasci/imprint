import React, { useState, useEffect } from "react";
import DeleteButton from "./DeleteButton";

const OBSTRUCTION_OPTIONS = [
  { value: "bench", label: "Bench" },
  { value: "car", label: "Car" },
  { value: "construction_materials", label: "Construction Materials" },
  { value: "cracked_pavement", label: "Cracked Pavement" },
  { value: "garbage", label: "Garbage" },
  { value: "lamp_post", label: "Lamp Post" },
  { value: "motorcycle", label: "Motorcycle" },
  { value: "potted_plant", label: "Potted Plant" },
  { value: "street_sign", label: "Street Sign" },
  { value: "street_vendor_cart", label: "Street Vendor Cart" },
  { value: "tree", label: "Tree" },
  { value: "tricycle", label: "Tricycle" },
  { value: "utility_post", label: "Utility Post" },
];

export interface IDefaultInputSection {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onDelete: () => void;
  onSelectObstruction: () => void;
  onUnselectObstruction: () => void;
  editable: boolean;
  selected: boolean;
  isRejected: boolean;
}

const DefaultInputSection = ({
  value,
  onChange,
  onDelete,
  onSelectObstruction,
  onUnselectObstruction,
  editable,
  selected,
  isRejected,
}: IDefaultInputSection) => {
  const [isCustom, setIsCustom] = useState(false);

  // Auto-detect if value is custom (not in list) to show input mode automatically
  useEffect(() => {
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
      // Standard empty/default
      setIsCustom(false);
    }
    // If value is "" (e.g. from selecting "Other" or clearing input), we do nothing and let state persist.
  }, [value, onChange]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedVal = e.target.value;
    if (selectedVal === "OTHER_CUSTOM") {
      setIsCustom(true);
      onChange(""); // Clear value so user can type fresh
    } else {
      onChange(selectedVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onSelectObstruction();
    }
  };


  const showInputSection = editable || selected;
  const deleteAction = editable ? onDelete : onUnselectObstruction;

  if (showInputSection) {
    return (
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-2 flex items-center gap-2 w-[280px] pointer-events-auto">
        {isCustom ? (
          <input
            autoFocus
            className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder-gray-400"
            placeholder="Type label name..."
            value={value === "---" ? "" : value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <div className="relative flex-1 min-w-0">
            <select
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
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
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        )}

        <button
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-blue-50 hover:bg-blue-100 text-primary transition-colors shadow-sm border border-blue-200"
          onClick={() => onSelectObstruction()}
          title="Confirm"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
        </button>

        <button
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-gray-50 hover:bg-gray-200 text-gray-700 transition-colors shadow-sm border border-gray-200"
          onClick={() => deleteAction()}
          title="Delete / Reject"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
      </div>
    );
  }

  // --- READ ONLY / NEUTRAL / REJECTED MODE ---
  return (
    <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-[280px] pointer-events-auto">
      <p className="text-sm font-semibold text-gray-800 mb-3 text-center">Is <span className="text-primary">{translateValue(value)}</span> an obstruction?</p>
      <div className="flex gap-2">
        <button
          className="flex-1 py-2 rounded-lg font-bold text-sm transition-all shadow-sm border border-blue-200 bg-blue-50 hover:bg-blue-100 text-primary"
          onClick={() => onSelectObstruction()}
        >
          Yes
        </button>
        <button
          className="flex-1 py-2 rounded-lg font-bold text-sm transition-all shadow-sm border bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700"
          onClick={() => {
            onUnselectObstruction();
          }}
        >
          No
        </button>
      </div>
    </div>
  );
};

const translateValue = (value: string) => {
  const standard = OBSTRUCTION_OPTIONS.find((opt) => opt.value === value);
  if (standard) return standard.label;
  if (value && value !== "---") return value;
  return value;
};

export default DefaultInputSection;