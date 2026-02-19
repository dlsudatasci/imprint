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
      <div className="rp-default-input-section">
        {isCustom ? (
          <input
            autoFocus
            className="rp-default-input-section_input"
            placeholder="Type label name..."
            value={value === "---" ? "" : value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <select
            className="rp-default-input-section_input"
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
        )}

        {isCustom && (
          <a
            className="rp-default-input-section_select list"
            onClick={() => {
              setIsCustom(false);
              onChange("---");
            }}
            title="Switch to list"
          >
            ≡
          </a>
        )}

        <a
          className="rp-default-input-section_select yes"
          onClick={() => onSelectObstruction()}
        >
          ✓
        </a>
        <a
          className="rp-default-input-section_delete"
          onClick={() => deleteAction()}
        >
          <DeleteButton />
        </a>
      </div>
    );
  }

  // --- READ ONLY / NEUTRAL / REJECTED MODE ---
  return (
    <div className="rp-default-select-section">
      {isRejected ? (
        <>
          <p>You selected {translateValue(value)} as not an obstruction.</p>
          <div>
            <a
              className="rp-default-input-section_select no"
              onClick={() => onUnselectObstruction()}
            >
              Undo
            </a>
          </div>
        </>
      ) : (
        <>
          <p>Is {translateValue(value)} an obstruction?</p>
          <div>
            <a
              className="rp-default-input-section_select yes"
              onClick={() => onSelectObstruction()}
            >
              Yes
            </a>
            <a
              className="rp-default-input-section_select no"
              onClick={() => onUnselectObstruction()}
            >
              No
            </a>
          </div>
        </>
      )}
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