import React from "react";
import { H2, P } from "../Typography";
import { SidewalkWidthIcon, EvennessIcon, EaseOfNavigationIcon, RoadBarrierIcon, SurfaceTypeIcon, SurfaceConditionIcon } from "./sceneIcons";
import { useTouchTap } from "./touchTap";

/** Step 3's answers, question set 2 (S15, util/validators/sceneQuestions.mjs) */
export interface SceneLevel {
  sidewalkWidth: string | null;
  overallAccessibility: number | null;
  surfaceEvenness: number | null;
  surfaceType: string | null;
  surfaceCondition: number | null;
  roadBarrier: boolean | null;
}

export interface SceneQuestionsProps {
  sceneLevel: SceneLevel;
  variant: "desktop" | "sheet";
  /** Step 1 answered Only a path: the questions that need a built sidewalk are off */
  pathOnly?: boolean;
  /** One answer changed */
  onAnswer: (updates: Partial<SceneLevel>) => void;
}

/**
 * Contributors' Step 3 (question set 2, S15). One copy for both layouts and
 * for the landing page's preview of the task. Presentational: the tool keeps
 * the answers and passes each change to onAnswer. In the sheet every option is
 * at least 44 px tall and no label is under 12 px. Every question runs worst
 * to best, stored higher is better (validators/sceneScale.mjs).
 *
 * Sidewalk Width asks how wide the sidewalk is as built, in three answers named
 * by how people can move along it: Narrow (one direction at a time), Limited
 * (two people can just pass) and Wide (both ways with room to spare). Ease of
 * Navigation (stored as overallAccessibility) follows it and is where the
 * objects on it count, answered by how obstructed the way is. Evenness is the
 * shape of the whole sidewalk along its length: Uneven, Sloped, Flat. Surface
 * Type is what most of it is made of, a category with no order. Surface
 * Condition: Cracked is lines only, every piece in place, Broken is something
 * missing or out of level. Road Barrier asks whether anything stands between
 * the sidewalk and the road: a curb alone is an ordinary sidewalk. Whether the
 * photo has a sidewalk is Step 1 (SidewalkPresence). For Only a path, Width,
 * Surface Type, Surface Condition and Road Barrier are off (pathOnly).
 */
export default function SceneQuestions({ sceneLevel, variant, pathOnly = false, onAnswer }: SceneQuestionsProps) {
  const sheet = variant === "sheet";
  const prompt = sheet ? "text-xs text-muted mb-1.5" : "text-[11px] text-muted mb-1.5";
  // Answer labels on a laptop are 11 px at the least (apple-design check, 17 Oct 2026)
  const optionLabel = sheet ? "text-xs font-semibold leading-tight text-center" : "text-[11px] font-semibold leading-tight text-center";
  const selectedClass = "border-primary bg-primary/10 text-primary ring-2 ring-primary/20";
  // The hover tint only where something hovers (12 Nov 2026). A phone keeps a
  // touched button in :hover, so a tap that did not answer looked half chosen.
  const idleClass = "border-line bg-surface text-body [@media(hover:hover)]:hover:bg-primary/5 [@media(hover:hover)]:hover:border-primary/30";
  // A finger's tap answers when it is let go (touchTap)
  const tap = useTouchTap();
  const card = "bg-surface-subtle p-3 rounded-card border border-line";
  // Each question is marked for the practice image, which lights them in turn (S19)

  const widthOptions = [
    { value: "one_person", label: "Narrow" },
    { value: "two_people", label: "Limited" },
    { value: "three_or_more", label: "Wide" },
  ];
  // Worst to best, stored 1 to 5 (overallAccessibility). The soft hyphen lets
  // Unobstructed break as Un-obstructed when five share a row.
  const easeOptions = [
    { value: 1, label: "Fully obstructed" },
    { value: 2, label: "Heavily obstructed" },
    { value: 3, label: "Moderately obstructed" },
    { value: 4, label: "Slightly obstructed" },
    { value: 5, label: "Un­obstructed" },
  ];
  const evennessOptions = [
    { value: 1, label: "Uneven" },
    { value: 2, label: "Sloped" },
    { value: 3, label: "Flat" },
  ];
  // What the surface is made of: no order, none is better than another
  const typeOptions = [
    { value: "concrete", label: "Concrete or asphalt" },
    { value: "tiles", label: "Tiles" },
    { value: "pavers", label: "Bricks or paver blocks" },
    { value: "unpaved", label: "Unpaved" },
  ];
  // Worst to best. A crack is a line only, with every piece in place and level.
  // Broken is something missing or out of level (BP 344 IRR B.3.6, "cracks or breaks").
  const conditionOptions = [
    { value: 1, label: "Broken" },
    { value: 2, label: "Cracked" },
    { value: 3, label: "Intact" },
  ];
  const barrierOptions = [
    { value: false, label: "No barrier" },
    { value: true, label: "Barrier" },
  ];

  /**
   * One question whose answers are pictures in a row: three, five (three and
   * two on a phone) or two across. Every picture is the same height so the rows line up.
   */
  function pictureRow<K extends keyof SceneLevel>(
    field: K,
    title: string,
    question: string,
    options: { value: NonNullable<SceneLevel[K]>; label: string }[],
    picture: (value: NonNullable<SceneLevel[K]>) => React.ReactNode,
    cols: string,
    note?: string,
    // The width and ease scenes are thin strips inside their box, so they get
    // a taller box. The pictures below them fill theirs, so a smaller one
    // gives every question about the same weight.
    small = false,
    // Asked only of a sidewalk: off, greyed and cleared, for a path (Step 1)
    needsSidewalk = false,
  ) {
    const off = needsSidewalk && pathOnly;
    return (
      <div data-scene-question={field} aria-disabled={off || undefined} className={`${card}${off ? " opacity-50" : ""}`}>
        <p className="text-sm font-semibold text-ink mb-0.5">{title}</p>
        <p className={prompt}>{off ? "Not asked for a path." : question}</p>
        <div className={`grid ${cols} gap-1`}>
          {options.map((opt) => {
            const on = sceneLevel[field] === opt.value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                data-scene-option={`${field}:${opt.value}`}
                aria-pressed={on}
                disabled={off}
                className={`${sheet ? "min-h-[44px] " : ""}${off ? "cursor-not-allowed " : ""}min-w-0 flex flex-col items-center px-0.5 py-1.5 rounded-card text-center transition-all border touch-manipulation ${on ? selectedClass : off ? "border-line bg-surface text-body" : idleClass}`}
                {...(off ? {} : tap(`${field}:${opt.value}`, () => onAnswer({ [field]: opt.value } as Partial<SceneLevel>)))}
              >
                <div className={`w-full ${small ? "h-11" : "h-16"} mb-1 flex items-end justify-center`}>{picture(opt.value)}</div>
                <span className={`${optionLabel} [hyphens:manual]`}>{opt.label}</span>
              </button>
            );
          })}
        </div>
        {note && <p className={`${prompt} mt-1.5 mb-0`}>{note}</p>}
      </div>
    );
  }

  return (
    // On a laptop, scrolled into view below the message pill, as the photo is (S20)
    <div id="scene-level-section" className={sheet ? "px-4 pt-4 pb-6" : "mb-6 scroll-mt-[calc(var(--nav-h,64px)+60px)]"}>
      <H2 className="text-lg font-bold text-ink mb-1">Step 3: Rate the Sidewalk</H2>
      <P className="text-body text-sm mb-4">
        Rate the following aspects of the sidewalk scene based on what you see in the image.
      </P>
      <div className="space-y-2">
        {pictureRow("sidewalkWidth", "Sidewalk Width", "How wide is the sidewalk?", widthOptions,
          (v) => <SidewalkWidthIcon value={v} />, "grid-cols-3", undefined, false, true)}
        {pictureRow("overallAccessibility", "Ease of Navigation", "How easy would it be for you to walk through here?", easeOptions,
          // One row on a laptop. A phone has no room for five "obstructed" at
          // 12 px, so it goes three and two there.
          (v) => <EaseOfNavigationIcon value={v} />, sheet ? "grid-cols-3" : "grid-cols-5")}
        {pictureRow("surfaceEvenness", "Evenness", "How even is the walking surface?", evennessOptions,
          (v) => <EvennessIcon value={v} />, "grid-cols-3", undefined, true)}
        {pictureRow("surfaceType", "Surface Type", "What is most of the walking surface made of?", typeOptions,
          (v) => <SurfaceTypeIcon value={v} />, "grid-cols-4", undefined, true, true)}
        {pictureRow("surfaceCondition", "Surface Condition", "Is the walking surface cracked or broken anywhere?", conditionOptions,
          (v) => <SurfaceConditionIcon value={v} />, "grid-cols-3", undefined, true, true)}
        {pictureRow("roadBarrier", "Road Barrier", "Is there anything between the sidewalk and the road?", barrierOptions,
          (v) => <div className="w-11 h-11"><RoadBarrierIcon value={v} /></div>, "grid-cols-2 w-2/3 mx-auto", undefined, true, true)}
      </div>
    </div>
  );
}
