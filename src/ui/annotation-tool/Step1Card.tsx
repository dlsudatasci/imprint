import React from "react";
import { H2, P } from "../Typography";
import { cn } from "../cn";
import { TRAY_COPY } from "@/features/annotate/objectTrays";

export interface Step1CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The photo: the tool's canvas, or the landing page preview's drawing */
  photo: React.ReactNode;
  /** The answers under the photo (ObjectTrays) */
  answers: React.ReactNode;
}

/**
 * Contributors' Step 1 card (7 Oct 2026): the heading, the instructions, the
 * photo in its grey well, and the answers under it, so Step 1 reads as one
 * unit. One copy for the tool's desktop layout and the landing page's preview
 * of the task (15 Oct 2026), so a change to the wording or the look shows in
 * both. Other attributes (a class, data attributes) go on the card.
 */
export default function Step1Card({ photo, answers, className, ...rest }: Step1CardProps) {
  return (
    <div {...rest} data-step1-card className={cn("bg-surface rounded-card border border-line shadow-sm overflow-hidden", className)}>
      <div className="p-4 pb-3">
        <H2 className="text-lg font-bold text-ink mb-1">{TRAY_COPY.stepHeading}</H2>
        <P className="text-body text-sm">
          Review objects <span className="font-semibold text-ink">on or beside the sidewalk</span>.
          For each dashed yellow box, decide whether it obstructs the path for <strong>you</strong>, traveling as you normally do.
          Draw new boxes to label any missed objects. {TRAY_COPY.stepHint}
        </P>
      </div>
      <div data-step1-well className="bg-surface-subtle p-2 border-y border-line">
        {photo}
      </div>
      {answers}
    </div>
  );
}
