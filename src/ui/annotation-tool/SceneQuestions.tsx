import React from "react";
import { H2, P } from "../Typography";
import { SidewalkWidthIcon, SurfaceConditionIcon, WalkingComfortIcon, AccessibleToMeIcon } from "./sceneIcons";

export interface SceneLevel {
  sidewalkWidth: string | null;
  surfaceCondition: number | null;
  walkability: number | null;
  overallAccessibility: number | null;
}

export interface SceneQuestionsProps {
  sceneLevel: SceneLevel;
  variant: "desktop" | "sheet";
  /** One answer changed. Choosing None for the width also clears the other three. */
  onAnswer: (updates: Partial<SceneLevel>) => void;
}

/**
 * Contributors' Step 2, the four questions about the sidewalk. One copy for
 * both layouts (9 Oct 2026), and for the landing page's preview of the task.
 * Presentational: the tool keeps the answers and passes each change to
 * onAnswer. The desktop layout keeps its classes. In the
 * sheet every option is at least 44 px tall and no label is under 12 px.
 */
export default function SceneQuestions({ sceneLevel, variant, onAnswer }: SceneQuestionsProps) {
  const sheet = variant === "sheet";
  const disabled = sceneLevel.sidewalkWidth === "no_sidewalk";
  // Shown under a greyed-out question when the image has no sidewalk
  const notApplicable = "Not applicable. There is no sidewalk.";
  const prompt = sheet ? "text-xs text-muted mb-1.5" : "text-[11px] text-muted mb-1.5";
  // Answer labels on a laptop are 11 px at the least (apple-design check, 17
  // Oct 2026): they were 9 and 10 px, below what reads at arm's length, on the
  // very answers a contributor picks. The sheet's are 12 px already.
  const optionLabel = (desktopSize: string) => sheet ? "text-xs font-semibold leading-tight text-center" : `${desktopSize} font-semibold leading-tight text-center`;
  // In the sheet a row of options wraps when it does not fit (12 Oct 2026):
  // on a 360 px phone the fifth accessibility option stuck out of its card,
  // and on a 320 px one the third comfort option did. The five options go
  // three and two under 390 px, where five in a row have no room.
  const optionRow = (gap: string) => (sheet ? `flex flex-wrap ${gap}` : `flex ${gap}`);
  const FIVE_ACROSS = "max-[389px]:basis-[30%]";
  const optionClass = (isSelected: boolean, desktopPadding: string, sheetExtra = "") =>
    `${sheet ? `min-h-[44px] ${sheetExtra} ` : ""}flex-1 flex flex-col items-center ${desktopPadding} rounded-control transition-all border ${isSelected
      ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
      : 'border-line bg-surface text-body' + (disabled ? ' cursor-not-allowed' : ' hover:bg-primary/5 hover:border-primary/30')
      }`;

  const surfaceOptions: { value: number; label: string; icon: "easy" | "some" | "difficult" }[] = [
    { value: 1, label: "Easy to traverse", icon: "easy" },
    { value: 2, label: "Some difficulty", icon: "some" },
    { value: 3, label: "Difficult or dangerous", icon: "difficult" },
  ];
  const comfortOptions: { value: number; label: string; icon: "comfortable" | "somewhat" | "uncomfortable" }[] = [
    { value: 1, label: "Comfortable", icon: "comfortable" },
    { value: 2, label: "Somewhat uncomfortable", icon: "somewhat" },
    { value: 3, label: "Uncomfortable", icon: "uncomfortable" },
  ];
  const accessOptions: { value: number; label: string; icon: "easy" | "mostly" | "somewhat" | "very" | "not" }[] = [
    { value: 1, label: "Easily accessible", icon: "easy" },
    { value: 2, label: "Mostly accessible", icon: "mostly" },
    { value: 3, label: "Somewhat difficult", icon: "somewhat" },
    { value: 4, label: "Very difficult", icon: "very" },
    { value: 5, label: "Not accessible", icon: "not" },
  ];

  return (
    <div id="scene-level-section" className={sheet ? "px-4 pt-4 pb-6" : "mb-6"}>
      <H2 className="text-lg font-bold text-ink mb-1">Step 2: Rate the Sidewalk</H2>
      <P className="text-body text-sm mb-4">
        Rate the following aspects of the sidewalk scene based on what you see in the image.
      </P>
      <div className="space-y-2">
        {/* Item 1 — Sidewalk Width */}
        <div className="bg-surface-subtle p-3 rounded-card border border-line">
          <p className="text-sm font-semibold text-ink mb-0.5">Sidewalk Width</p>
          <p className={prompt}>How much usable walking space does this sidewalk have?</p>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { value: "three_or_more", label: "Wide", icon: "threePlus" as const },
              { value: "two_people", label: "Moderate", icon: "twoPeople" as const },
              { value: "one_person", label: "Narrow", icon: "onePerson" as const },
              { value: "no_sidewalk", label: "None", icon: "noSidewalk" as const },
            ].map((opt) => (
              <button
                key={opt.value}
                data-scene-option={`sidewalkWidth:${opt.value}`}
                className={`${sheet ? "min-h-[44px] " : ""}flex flex-col items-center p-2 rounded-card text-center transition-all border ${sceneLevel.sidewalkWidth === opt.value
                  ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                  : 'border-line bg-surface text-body hover:bg-primary/5 hover:border-primary/30'
                  }`}
                onClick={() => {
                  const updates: Partial<SceneLevel> = { sidewalkWidth: opt.value };
                  // No sidewalk: the other three questions are greyed out, so
                  // clear any answers given before "None" was chosen.
                  if (opt.value === "no_sidewalk") {
                    updates.surfaceCondition = null;
                    updates.walkability = null;
                    updates.overallAccessibility = null;
                  }
                  onAnswer(updates);
                }}
              >
                <div className="w-12 h-12 mb-1 flex items-end justify-center">
                  <SidewalkWidthIcon type={opt.icon} />
                </div>
                <span className={sheet ? "text-xs font-semibold leading-tight" : "text-[11px] font-semibold leading-tight"}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Item 2 — Surface Condition (disabled when no sidewalk) */}
        {/* Ground cross-section profiles — visual language: the surface itself.
            3-level functional scale per Wolf et al. (2007) and Project Sidewalk reliability data. */}
        <div className={`bg-surface-subtle p-3 rounded-card border border-line${disabled ? ' opacity-50' : ''}`}>
          <p className="text-sm font-semibold text-ink mb-0.5">Surface Condition</p>
          <p className={prompt}>
            {disabled ? notApplicable : "How does the walking surface affect movement?"}
          </p>
          <div className={optionRow("gap-1.5")}>
            {surfaceOptions.map((opt) => (
              <button
                key={opt.value}
                data-scene-option={`surfaceCondition:${opt.value}`}
                disabled={disabled}
                className={optionClass(!disabled && sceneLevel.surfaceCondition === opt.value, "py-2 px-1")}
                onClick={() => {
                  if (!disabled) {
                    onAnswer({ surfaceCondition: opt.value });
                  }
                }}
              >
                <div className="w-10 h-10 mb-1 flex items-center justify-center">
                  <SurfaceConditionIcon type={opt.icon} />
                </div>
                <span className={optionLabel("text-[11px]")}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Item 3 — Walking Comfort (disabled when no sidewalk) */}
        {/* Face expressions — visual language: how the scene *feels*.
            Reframed from undefined "walkability" to concrete "comfort" per Mehta (2008).
            3-level scale per Kim et al. (2025) stability findings. */}
        <div className={`bg-surface-subtle p-3 rounded-card border border-line${disabled ? ' opacity-50' : ''}`}>
          <p className="text-sm font-semibold text-ink mb-0.5">Walking Comfort</p>
          <p className={prompt}>
            {disabled ? notApplicable : "How comfortable does this sidewalk look for walking?"}
          </p>
          <div className={optionRow("gap-1.5")}>
            {comfortOptions.map((opt) => (
              <button
                key={opt.value}
                data-scene-option={`walkability:${opt.value}`}
                disabled={disabled}
                className={optionClass(!disabled && sceneLevel.walkability === opt.value, "py-2 px-1")}
                onClick={() => {
                  if (!disabled) {
                    onAnswer({ walkability: opt.value });
                  }
                }}
              >
                <div className="w-10 h-10 mb-1 flex items-center justify-center">
                  <WalkingComfortIcon type={opt.icon} />
                </div>
                <span className={optionLabel("text-[11px]")}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Item 4 — Accessible to Me (disabled when no sidewalk) */}
        {/* Gateway/path metaphor with traffic-light colour gradient.
            Self-referential "to me" framing per Huang et al. (2025) and Li et al. (2025).
            5-point scale: Preston & Colman (2000) show 2-4 point scales have worst
            psychometric properties; Project Sidewalk uses 1-5 severity; finer scale
            captures person-dependent variation that IS the signal (thesis core argument).
            Can be collapsed to 3 levels for reporting if needed. */}
        <div className={`bg-surface-subtle p-3 rounded-card border border-line${disabled ? ' opacity-50' : ''}`}>
          <p className="text-sm font-semibold text-ink mb-0.5">Accessible to Me</p>
          <p className={prompt}>
            {disabled ? notApplicable : "Could you personally navigate this sidewalk?"}
          </p>
          <div className={optionRow("gap-1")}>
            {accessOptions.map((opt) => (
              <button
                key={opt.value}
                data-scene-option={`overallAccessibility:${opt.value}`}
                disabled={disabled}
                className={optionClass(!disabled && sceneLevel.overallAccessibility === opt.value, "py-1.5 px-0.5", FIVE_ACROSS)}
                onClick={() => {
                  if (!disabled) {
                    onAnswer({ overallAccessibility: opt.value });
                  }
                }}
              >
                <div className="w-8 h-8 mb-0.5 flex items-center justify-center">
                  <AccessibleToMeIcon type={opt.icon} />
                </div>
                <span className={optionLabel("text-[11px]")}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
