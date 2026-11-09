import React from "react";
import { H2, P } from "../Typography";

export interface SidewalkPresenceProps {
  /** true a sidewalk, false a path, null not answered */
  value: boolean | null;
  /** desktop: a card above the photo. sheet: the top of a phone's answers sheet */
  variant: "desktop" | "sheet";
  onAnswer: (value: boolean) => void;
  /**
   * The tutorial's practice (S19, S15): the one answer enabled, the other
   * shown disabled. Both without it.
   */
  allowed?: boolean | null;
}

/**
 * Contributors' Step 1 (S15, 9 Nov 2026): is there a sidewalk raised on a
 * curb, or only a path people walk on? Two plain buttons, asked before the objects, which become
 * Step 2. Path turns off the Step 3 questions that need a built sidewalk
 * (Sidewalk Width, Surface Type, Surface Condition, Road Barrier). On a phone
 * it fills the top of the answers sheet until it is answered.
 */
export default function SidewalkPresence({ value, variant, onAnswer, allowed = null }: SidewalkPresenceProps) {
  const sheet = variant === "sheet";
  const selectedClass = "border-primary bg-primary/10 text-primary ring-2 ring-primary/20";
  const idleClass = "border-line bg-surface text-body hover:bg-primary/5 hover:border-primary/30";
  const options = [
    { value: true, label: "Yes, there is a sidewalk." },
    { value: false, label: "No, there is only a path for people to walk on." },
  ];
  return (
    <div id="sidewalk-presence-section" data-step="presence" className={sheet ? "px-4 pt-3 pb-3" : "bg-surface rounded-card border border-line shadow-sm p-4 mb-4"}>
      <H2 className={sheet ? "text-base font-bold text-ink mb-0.5" : "text-lg font-bold text-ink mb-0.5"}>Step 1: Is There a Sidewalk?</H2>
      {/* 14 px on a phone (md:text-sm keeps the mockup's phone frame at that size too) */}
      <P className={sheet ? "text-body text-sm md:text-sm mb-3" : "text-body text-sm mb-3"}>Check if the photo has a sidewalk that is raised above the road on a curb.</P>
      {/* Side by side on a laptop, one under the other on a phone */}
      <div className={sheet ? "grid grid-cols-1 gap-2" : "flex flex-wrap gap-2"}>
        {options.map((opt) => {
          const on = value === opt.value;
          const off = allowed !== null && allowed !== undefined && allowed !== opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              data-presence-option={String(opt.value)}
              aria-pressed={on}
              disabled={off}
              className={`min-h-[44px] px-4 py-2 rounded-control border text-sm font-semibold text-left transition-all ${on ? selectedClass : off ? "border-line bg-surface text-body opacity-50 cursor-not-allowed" : idleClass}`}
              onClick={() => onAnswer(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
