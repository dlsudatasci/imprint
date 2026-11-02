import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SIDEWALK_QUESTION_COPY } from "./sidewalkQuestionCopy";
import { TRAY_COPY, PEEK_TAG } from "./objectTrays";
import { buildTourSteps } from "@/features/tutorial/tourSteps";
import { GUIDE_COPY } from "@/features/contribute/help/guideCopy";
import Step1Card from "@/ui/annotation-tool/Step1Card";

// S12 (2 Nov 2026): the sidewalk question's wording, decided by Rans. The
// list of its own was dropped the same day: a No is listed under Not
// obstructions.
describe("SIDEWALK_QUESTION_COPY", () => {
  it("keeps the decided wording word for word", () => {
    expect(SIDEWALK_QUESTION_COPY).toEqual({
      question: "Is it on the sidewalk or the path people walk on?",
      incomplete: "Please say whether each object is on the sidewalk or the path people walk on.",
      tutorial: "Some streets have no sidewalk. There, the path people walk on is usually the edge of the road. Answer Yes if the object is on that path.",
    });
  });

  it("has no em dash or semicolon", () => {
    for (const text of Object.values(SIDEWALK_QUESTION_COPY)) expect(text).not.toMatch(/[—;]/);
  });

  it("is what the tour, the guide and the Step 1 instructions show", () => {
    for (const input of ["pointer", "touch"]) {
      const canvas = buildTourSteps(false, "objects", input)[0];
      expect(canvas.content).toContain(SIDEWALK_QUESTION_COPY.question);
      expect(canvas.content).toContain(SIDEWALK_QUESTION_COPY.tutorial);
    }
    const guide = GUIDE_COPY.steps.flatMap((step) => step.paragraphs).join(" ");
    expect(guide).toContain(SIDEWALK_QUESTION_COPY.question);
    const card = renderToStaticMarkup(React.createElement(Step1Card, { photo: null, answers: null }));
    expect(card).toContain(`first answer “${SIDEWALK_QUESTION_COPY.question}” If it is, decide whether it obstructs the path for <strong>you</strong>, traveling as you normally do.`);
  });

  it("names no list of its own anywhere: a No to the path question goes under Not obstructions", () => {
    const tours = ["pointer", "touch"].flatMap((input) => buildTourSteps(false, "objects", input).map((step) => step.content));
    const guide = GUIDE_COPY.steps.flatMap((step) => step.paragraphs);
    for (const text of [...tours, ...guide, ...Object.values(TRAY_COPY), ...Object.values(PEEK_TAG)]) {
      expect(text).not.toMatch(/walking path/i);
    }
    expect(guide.join(" ")).toContain("A No to the path question takes the box off the photo and lists it under Not obstructions.");
    expect(tours.join(" ")).toContain("A No to the path question takes the box off the photo and lists it under Not obstructions.");
  });
});
