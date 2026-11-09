import React from "react";
import { H2, P } from "../Typography";
import { cn } from "../cn";
import { TRAY_COPY } from "@/features/annotate/objectTrays";

export interface Step1CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The photo: the tool's canvas, or the landing page preview's drawing */
  photo: React.ReactNode;
  /** The answers under the photo (ObjectTrays) */
  answers: React.ReactNode;
  /**
   * The instructions' id, which the tutorial's "What Counts as the Path" step
   * pointed at from S16 until 5 Nov 2026 (it points at the photo now). null
   * for the landing page's preview and the guide's stills, which draw the
   * card several times on one page.
   */
  instructionsId?: string | null;
  /** Step 1 answered Only a path (S15): the paragraph about the path */
  pathOnly?: boolean;
  /** The path paragraph's touch words: "Tap", and "tap Add box" for the drag */
  touch?: boolean;
}

/** Before Step 1 is answered, and for a sidewalk */
export const STEP2_PARAGRAPH =
  "The dashed yellow boxes are suggested objects. Click each one, check its label, then answer whether it's on the sidewalk and whether it's an obstruction. If the photo shows two sidewalks, only the one nearest you counts. You can also drag your mouse to box objects on the sidewalk or path that we missed, whether or not they obstruct. Leave out objects that are not on the sidewalk.";

/** Step 1 answered Only a path (S15), with the pointer's or the finger's words */
export const step2PathParagraph = (touch = false) =>
  touch
    ? "The dashed yellow boxes are suggested objects. Tap each one, check its label, then answer whether it obstructs the path. You can also tap Add box to box objects on the path that we missed, whether or not they obstruct."
    : "The dashed yellow boxes are suggested objects. Click each one, check its label, then answer whether it obstructs the path. You can also drag your mouse to box objects on the path that we missed, whether or not they obstruct.";

/**
 * Contributors' Step 2 card (Step 1 until S15, 9 Nov 2026, when Step 1 became
 * whether there is a sidewalk; the file keeps its name). From 7 Oct 2026: the
 * heading (TRAY_COPY.stepHeading), the instructions, the photo in its grey
 * well, and the answers under it, so the step reads as one unit. One copy for the tool's desktop layout and the landing page's preview
 * of the task (15 Oct 2026), so a change to the wording or the look shows in
 * both. Other attributes (a class, data attributes) go on the card. From
 * 2 Nov 2026 (S12) the instructions name both questions in order, the first
 * in sidewalkQuestionCopy.js's words. From 3 Nov 2026 (S16) they match the
 * tutorial: a box is only the model's guess, then the two questions as a
 * numbered list, with only the nearest sidewalk counting. "Review objects on
 * or beside the sidewalk" was dropped: it made boxed objects read as part of
 * the sidewalk, and Question 1 now does that job. From S16b (the same day,
 * Rans's wording) they are one short paragraph with no list, and "Your answers
 * are listed below the photo." is gone. After his review the same day the
 * paragraph names the two questions by what they ask rather than quoting the
 * first. From S18 (4 Nov 2026, pilot participant 4 found it wordy) it no
 * longer numbers them: the box panel's "Question 1 of 2" labels do that. Its
 * last sentence says the mouse and that the boxes to draw are the objects we
 * missed, obstructing or not, and to leave out objects off the sidewalk
 * (Rans, 5 Nov 2026). It said "objects that are obstructing the sidewalk"
 * from S16b, but every object on the path is boxed.
 *
 * S15 (9 Nov 2026): once Step 1 is answered Only a path (`pathOnly`) the
 * paragraph is about the path, with no sidewalk question, in "tap" words on a
 * touch screen (`touch`). Before Step 1 is answered, and for a sidewalk, it is
 * the paragraph above.
 */
export default function Step1Card({ photo, answers, instructionsId = "step1-instructions", pathOnly = false, touch = false, className, ...rest }: Step1CardProps) {
  return (
    <div {...rest} data-step1-card className={cn("bg-surface rounded-card border border-line shadow-sm overflow-hidden", className)}>
      <div id={instructionsId ?? undefined} className="p-4 pb-3">
        <H2 className="text-lg font-bold text-ink mb-1">{TRAY_COPY.stepHeading}</H2>
        <P className="text-body text-sm">{pathOnly ? step2PathParagraph(touch) : STEP2_PARAGRAPH}</P>
      </div>
      <div data-step1-well className="bg-surface-subtle p-2 border-y border-line">
        {photo}
      </div>
      {answers}
    </div>
  );
}
