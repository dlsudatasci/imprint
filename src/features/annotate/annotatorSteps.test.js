import { describe, it, expect } from "vitest";
import {
  ANNOTATOR_STEPS,
  annotatorStepsFor,
  enabledAnnotatorSteps,
  annotatorStepHeading,
  nextAnnotatorStep,
  previousAnnotatorStep,
} from "./annotatorSteps.js";

describe("annotator steps", () => {
  it("enables Objects, Sidewalk and Obstructions (6 Oct 2026)", () => {
    expect(ANNOTATOR_STEPS.map((s) => s.key)).toEqual(["objects", "sidewalk", "obstructions"]);
    expect(enabledAnnotatorSteps().map((s) => s.key)).toEqual(["objects", "sidewalk", "obstructions"]);
  });

  it("numbers three steps on a model-development image", () => {
    expect(annotatorStepHeading("objects")).toBe("Step 1 of 3: Objects");
    expect(annotatorStepHeading("sidewalk")).toBe("Step 2 of 3: Sidewalk");
    expect(annotatorStepHeading("obstructions")).toBe("Step 3 of 3: Obstructions");
    const withSidewalk = annotatorStepsFor({ askSidewalk: true });
    expect(annotatorStepHeading("sidewalk", withSidewalk)).toBe("Step 2 of 3: Sidewalk");
  });

  it("gives the two-step headings without Sidewalk, leaving ANNOTATOR_STEPS untouched", () => {
    const twoSteps = annotatorStepsFor({ askSidewalk: false });
    expect(annotatorStepHeading("objects", twoSteps)).toBe("Step 1 of 2: Objects");
    expect(annotatorStepHeading("obstructions", twoSteps)).toBe("Step 2 of 2: Obstructions");
    expect(() => annotatorStepHeading("sidewalk", twoSteps)).toThrow();
    expect(Object.isFrozen(twoSteps)).toBe(true);
    expect(twoSteps).not.toBe(ANNOTATOR_STEPS);
    expect(ANNOTATOR_STEPS.find((s) => s.key === "sidewalk").enabled).toBe(true);
    expect(Object.isFrozen(ANNOTATOR_STEPS)).toBe(true);
  });

  it("gives the neighbouring enabled step in both lists, or null at either end", () => {
    expect(nextAnnotatorStep("objects")).toBe("sidewalk");
    expect(nextAnnotatorStep("sidewalk")).toBe("obstructions");
    expect(previousAnnotatorStep("obstructions")).toBe("sidewalk");
    expect(previousAnnotatorStep("sidewalk")).toBe("objects");
    expect(nextAnnotatorStep("obstructions")).toBeNull();
    expect(previousAnnotatorStep("objects")).toBeNull();

    const twoSteps = annotatorStepsFor({ askSidewalk: false });
    expect(nextAnnotatorStep("objects", twoSteps)).toBe("obstructions");
    expect(previousAnnotatorStep("obstructions", twoSteps)).toBe("objects");
  });

  it("throws for an unknown step", () => {
    expect(() => annotatorStepHeading("nope")).toThrow();
    expect(() => nextAnnotatorStep("nope")).toThrow();
    expect(() => previousAnnotatorStep("nope")).toThrow();
  });
});
