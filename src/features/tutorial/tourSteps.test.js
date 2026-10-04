import { describe, it, expect } from "vitest";
import { buildTourSteps, tourTargets, tourStepCount } from "./tourSteps";

describe("tour steps", () => {
  it("gives contributors five steps at the five targets", () => {
    expect(tourStepCount(false)).toBe(5);
    expect([...tourTargets(false)]).toEqual([
      ".rp-stage",
      "#box-review-section",
      "#box-review-section",
      "#scene-level-section",
      "button[type='submit']",
    ]);
    const steps = buildTourSteps(false);
    expect(steps.map((s) => s.title)).toEqual([
      "Annotation Canvas",
      "Box vs. Obstruction",
      "Severity",
      "Scene-Level Assessment",
      "Submit",
    ]);
  });

  it("gives annotators four Step 1 Objects steps (4 Oct 2026)", () => {
    expect(tourStepCount(true)).toBe(4);
    expect([...tourTargets(true)]).toEqual([".rp-stage", "#taxonomy-guide", "#box-review-section", "button[type='submit']"]);
    const steps = buildTourSteps(true);
    expect(steps.map((s) => s.title)).toEqual(["Annotation Canvas", "What to Box", "Objects in This Image", "Submit"]);
    expect(steps.map((s) => s.placement)).toEqual(["bottom", "left", "top", "top"]);
  });

  it("never asks annotators for Yes/No, obstruction, severity or scene answers", () => {
    for (const s of buildTourSteps(true)) {
      expect(s.target).not.toBe("#scene-level-section");
      expect(s.content).not.toMatch(/severity|scene-level|obstruct/i);
      expect(s.content).not.toMatch(/\bYes\b|'No'|answered/);
    }
  });

  it("builds one step per target for both roles", () => {
    for (const isAnnotator of [false, true]) {
      const steps = buildTourSteps(isAnnotator);
      expect(steps).toHaveLength(tourStepCount(isAnnotator));
      expect(steps.map((s) => s.target)).toEqual([...tourTargets(isAnnotator)]);
      for (const s of steps) {
        expect(s.title).toBeTruthy();
        expect(s.content).toBeTruthy();
        expect(s.skipBeacon).toBe(true);
        expect(s.overlayClickAction).toBe("none");
      }
    }
  });

  it("defaults to the contributor version", () => {
    expect(buildTourSteps()).toEqual(buildTourSteps(false));
  });

  it("tells annotators to box every taxonomy object anywhere, with Keep or Not an object on suggestions", () => {
    const [canvas, guide, objects] = buildTourSteps(true);
    expect(canvas.content).toMatch(/every object from the 18 categories that you can see anywhere in the image, on the sidewalk or not/);
    expect(canvas.content).toMatch(/click Keep/);
    expect(canvas.content).toMatch(/Not an object/);
    expect(guide.content).toMatch(/18 categories and the rules/);
    expect(objects.content).toMatch(/Next suggestion to decide/);
  });

  it("does not tell annotators that boxes only mark objects on or beside the walking space", () => {
    for (const s of buildTourSteps(true)) {
      expect(s.content).not.toMatch(/on or beside the walking space/);
    }
  });

  it("does not mention reference images to annotators", () => {
    for (const s of buildTourSteps(true)) expect(s.content).not.toMatch(/[Rr]eference/);
  });

  it("keeps the contributor wording for the canvas and box steps", () => {
    const [canvas, boxVsObstruction] = buildTourSteps(false);
    expect(canvas.content).toMatch(/^Dashed yellow boxes are model suggestions\./);
    expect(boxVsObstruction.content).toMatch(/^Drawing a box records that an object is on or beside the walking space\./);
  });

  it("names what Submit needs for each role and never says the button is disabled", () => {
    const contributorSubmit = buildTourSteps(false).at(-1);
    const annotatorSubmit = buildTourSteps(true).at(-1);
    for (const step of [contributorSubmit, annotatorSubmit]) {
      expect(step.title).toBe("Submit");
      expect(step.content).toMatch(/a message tells you what to finish/);
      expect(step.content).not.toMatch(/disabled/i);
      expect(step.content).not.toMatch(/accepted or rejected/);
    }
    expect(contributorSubmit.content).toMatch(/\(Yes, No, or Not an object\)/);
    expect(contributorSubmit.content).toMatch(/all four scene-level questions/);
    expect(annotatorSubmit.content).toMatch(/every suggested box is kept or marked Not an object/);
    expect(annotatorSubmit.content).toMatch(/every box has a category/);
    expect(annotatorSubmit.content).not.toMatch(/scene-level|Yes or No/);
  });

  it("describes the current scene questions to contributors", () => {
    const sceneStep = buildTourSteps(false)[3];
    expect(sceneStep.content).toMatch(/its width, its surface condition, how comfortable it looks for walking/);
    expect(sceneStep.content).toMatch(/choose None and the other three are skipped/);
    expect(sceneStep.content).not.toMatch(/whether a sidewalk is present/);
  });

  it("has no em dash in any step for either role", () => {
    for (const isAnnotator of [false, true]) {
      for (const s of buildTourSteps(isAnnotator)) {
        expect(s.title).not.toMatch(/—/);
        expect(s.content).not.toMatch(/—/);
      }
    }
  });
});
