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
    const isStandard = OBSTRUCTION_OPTIONS.some((opt) => opt.value === value);
    if (!isStandard && value && value !== "---") {
      setIsCustom(true);
    } else if (isStandard || value === "---") {
      setIsCustom(false);
    }
  }, [value]);

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


  return (
    <>
      {editable ? (
        <div className="rp-default-input-section">

          {/* --- TERNARY OPERATOR: SWAP SELECT FOR INPUT --- */}
          {isCustom ? (
            // 1. CUSTOM INPUT MODE
            <>
              <input
                autoFocus
                className="rp-default-input-section_input"
                placeholder="Type label name..."
                value={value === "---" ? "" : value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{}}
              />
            </>
          ) : (
            // 2. DROPDOWN MODE
            <select
              className="rp-default-input-section_input"
              value={value || "---"}
              onChange={handleSelectChange}
              style={{}}
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

          {/* --- COMMON BUTTONS (Confirm & Delete) --- */}
          <a
            className="rp-default-input-section_select yes"
            onClick={() => onSelectObstruction()}
          >
            ✓
          </a>
          <a
            className="rp-default-input-section_delete"
            onClick={() => onDelete()}
          >
            <DeleteButton />
          </a>
        </div>
      ) : (
        // --- READ ONLY MODE ---
        <div className="rp-default-select-section">
          {selected ? (
            <>
              <p>You selected {translateValue(value)} as an obstruction.</p>
              <div>
                <a
                  className="rp-default-input-section_select no"
                  onClick={() => onUnselectObstruction()}
                >
                  Remove
                </a>
              </div>
            </>
          ) : isRejected ? (
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
      )}
    </>
  );
};

const translateValue = (value: string) => {
  const standard = OBSTRUCTION_OPTIONS.find((opt) => opt.value === value);
  if (standard) return standard.label;
  if (value && value !== "---") return value;
  return value;
};

export default DefaultInputSection;