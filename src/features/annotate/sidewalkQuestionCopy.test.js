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
    expect(SIDEWALK_QUESTION_COPY.question).toBe("Is it on the sidewalk or the path people walk on?");
    expect(SIDEWALK_QUESTION_COPY.incomplete).toBe("Please say whether each object is on the sidewalk or the path people walk on.");
  });

  // S16 (3 Nov 2026): what counts as the path, in three lines, with Rans's
  // rule on two sidewalks (only the nearest counts) as the third
  it("says what counts as the path in three lines, the third the nearest-sidewalk rule", () => {
    expect(SIDEWALK_QUESTION_COPY.pathPoints).toEqual([
      "The path is the sidewalk, or any paved path made for walking.",
      "No sidewalk in the photo? The path is the edge of the road people walk along.",
      "More than one sidewalk? Only the one nearest you counts. Answer No for objects on a farther one.",
    ]);
    expect(Object.isFrozen(SIDEWALK_QUESTION_COPY.pathPoints)).toBe(true);
    // Never that a farther sidewalk is judged too
    expect(SIDEWALK_QUESTION_COPY.pathPoints.join(" ")).not.toMatch(/both sidewalks|every sidewalk|each sidewalk/i);
  });

  it("labels the two questions 1 of 2 and 2 of 2", () => {
    expect(SIDEWALK_QUESTION_COPY.questionOf(1)).toBe("Question 1 of 2");
    expect(SIDEWALK_QUESTION_COPY.questionOf(2)).toBe("Question 2 of 2");
  });

  it("has no tutorial sentence any more: pathPoints replaced it", () => {
    expect(SIDEWALK_QUESTION_COPY).not.toHaveProperty("tutorial");
    expect(Object.keys(SIDEWALK_QUESTION_COPY).sort()).toEqual([
      "answerWhether", "backTo", "backToQuestion", "boxesReset", "firstStep1", "incomplete", "pathPoints", "pathQuestion", "question", "questionOf",
    ]);
  });

  // S17 (4 Nov 2026): the way back at the foot of the box panel
  it("names the way back to each question", () => {
    expect(SIDEWALK_QUESTION_COPY.backTo(1)).toBe("Back to Question 1");
    expect(SIDEWALK_QUESTION_COPY.backTo(2)).toBe("Back to Question 2");
  });

  it("has no em dash or semicolon", () => {
    const texts = [
      SIDEWALK_QUESTION_COPY.question,
      SIDEWALK_QUESTION_COPY.incomplete,
      ...SIDEWALK_QUESTION_COPY.pathPoints,
      SIDEWALK_QUESTION_COPY.questionOf(1),
      SIDEWALK_QUESTION_COPY.questionOf(2),
      SIDEWALK_QUESTION_COPY.answerWhether,
      SIDEWALK_QUESTION_COPY.backTo(1),
      SIDEWALK_QUESTION_COPY.backTo(2),
      SIDEWALK_QUESTION_COPY.pathQuestion.before,
      SIDEWALK_QUESTION_COPY.pathQuestion.after,
      SIDEWALK_QUESTION_COPY.backToQuestion,
      SIDEWALK_QUESTION_COPY.firstStep1,
      SIDEWALK_QUESTION_COPY.boxesReset,
    ];
    for (const text of texts) expect(text).not.toMatch(/[—;]/);
  });

  // Only a path (S15, 9 Nov 2026)
  it("words the path's one question, its way back and the Step 1 messages", () => {
    expect(`${SIDEWALK_QUESTION_COPY.pathQuestion.before}Tree${SIDEWALK_QUESTION_COPY.pathQuestion.after}`).toBe("Does Tree obstruct the path?");
    expect(SIDEWALK_QUESTION_COPY.backToQuestion).toBe("Back to the question");
    expect(SIDEWALK_QUESTION_COPY.firstStep1).toBe("First, answer Step 1: is there a sidewalk?");
    expect(SIDEWALK_QUESTION_COPY.boxesReset).toBe("Some boxes need answering again.");
  });

  it("is what the tour and the guide show, and Step 1's instructions keep the nearest-sidewalk rule", () => {
    for (const input of ["pointer", "touch"]) {
      // Step 1 first from S15
      const [, check, path] = buildTourSteps(false, "objects", input);
      // The tour says it as an instruction (Rans, 5 Nov 2026)
      expect(check.content).toContain(SIDEWALK_QUESTION_COPY.answerWhether);
      expect(SIDEWALK_QUESTION_COPY.answerWhether).toBe("Answer whether it's on the sidewalk or the path people walk on.");
      expect(path.points).toEqual([...SIDEWALK_QUESTION_COPY.pathPoints]);
    }
    const guide = GUIDE_COPY.steps.flatMap((step) => step.paragraphs).join(" ");
    expect(guide).toContain(SIDEWALK_QUESTION_COPY.question);
    expect(GUIDE_COPY.steps.find((step) => step.id === "answer").pathPoints).toBe(SIDEWALK_QUESTION_COPY.pathPoints);
    // Step 1's instructions name the questions by what they ask (Rans, 3 Nov 2026), with no numbers from S18, and the nearest-sidewalk rule
    const card = renderToStaticMarkup(React.createElement(Step1Card, { photo: null, answers: null })).replace(/&#x27;/g, "'");
    expect(card).toContain("answer whether it's on the sidewalk and whether it's an obstruction. If the photo shows two sidewalks, only the one nearest you counts.");
  });

  it("names no list of its own anywhere: a No to the path question goes under Not obstructions", () => {
    const tours = ["pointer", "touch"].flatMap((input) => buildTourSteps(false, "objects", input).map((step) => step.content));
    const guide = GUIDE_COPY.steps.flatMap((step) => step.paragraphs);
    for (const text of [...tours, ...guide, ...Object.values(TRAY_COPY), ...Object.values(PEEK_TAG)]) {
      expect(text).not.toMatch(/walking path/i);
    }
    // Neither the tour (S16b) nor the guide (Rans, 5 Nov 2026) names the lists' contents any more
  });
});
