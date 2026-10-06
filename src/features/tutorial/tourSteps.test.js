import { describe, it, expect } from "vitest";
import { buildTourSteps, tourTargets, tourStepCount, tourBeaconPlacements } from "./tourSteps";

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

  it("gives annotators four steps in Objects, the last pointing to Sidewalk (6 Oct 2026)", () => {
    expect(tourStepCount(true)).toBe(4);
    expect([...tourTargets(true)]).toEqual([".rp-stage", "#taxonomy-guide", "#box-review-section", "button[type='submit']"]);
    const steps = buildTourSteps(true);
    expect(steps.map((s) => s.title)).toEqual(["Annotation Canvas", "What to Box", "Objects in This Image", "Next: Sidewalk"]);
    expect(steps.map((s) => s.placement)).toEqual(["bottom", "left", "top", "top"]);
  });

  it("never asks annotators for Yes/No, severity or scene answers, and only the last step mentions obstruction", () => {
    const steps = buildTourSteps(true);
    for (const s of steps) {
      expect(s.target).not.toBe("#scene-level-section");
      expect(s.content).not.toMatch(/severity|scene-level/i);
      expect(s.content).not.toMatch(/\bYes\b|'No'|answered/);
    }
    for (const s of steps.slice(0, -1)) expect(s.content).not.toMatch(/obstruct/i);
    expect(steps.at(-1).content).toMatch(/obstruct the sidewalk for you/);
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
    expect(objects.content).toMatch(/which suggestions you still need to decide/);
    expect(objects.content).toMatch(/Click a box in the list to select it/);
    // The "Next suggestion to decide" button was removed (6 Oct 2026)
    expect(objects.content).not.toMatch(/Next suggestion to decide/);
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

  it("names what each role's last step needs and never says the button is disabled", () => {
    const contributorSubmit = buildTourSteps(false).at(-1);
    const annotatorNext = buildTourSteps(true).at(-1);
    for (const step of [contributorSubmit, annotatorNext]) {
      expect(step.content).toMatch(/a message tells you what to finish/);
      expect(step.content).not.toMatch(/disabled/i);
      expect(step.content).not.toMatch(/accepted or rejected/);
    }
    expect(contributorSubmit.title).toBe("Submit");
    expect(contributorSubmit.content).toMatch(/\(Yes, No, or Not an object\)/);
    expect(contributorSubmit.content).toMatch(/all four scene-level questions/);
  });

  it("tells annotators to click Next: Sidewalk, outline the walking space, then mark obstructions", () => {
    const annotatorNext = buildTourSteps(true).at(-1);
    expect(annotatorNext.title).toBe("Next: Sidewalk");
    expect(annotatorNext.content).toMatch(/every suggested box is kept or marked Not an object/);
    expect(annotatorNext.content).toMatch(/every box has a category, click Next: Sidewalk/);
    expect(annotatorNext.content).toMatch(/You then outline the walking space/);
    expect(annotatorNext.content).toMatch(/after that mark which objects obstruct the sidewalk for you/);
    expect(annotatorNext.content).not.toMatch(/disabled/i);
    expect(annotatorNext.content).not.toMatch(/scene-level|Yes or No/);
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

// Annotators' Sidewalk and Obstructions steps have their own tours (6 Oct 2026)
describe("annotator tours for Sidewalk and Obstructions", () => {
  it("gives Sidewalk five steps: canvas, tools, guide, shapes card, Next: Obstructions", () => {
    expect(tourStepCount(true, "sidewalk")).toBe(5);
    expect([...tourTargets(true, "sidewalk")]).toEqual([".rp-stage", "#sidewalk-tools", "#sidewalk-guide", "#sidewalk-shapes", "button[type='submit']"]);
    const steps = buildTourSteps(true, "sidewalk");
    expect(steps.map((s) => s.title)).toEqual(["Outline the Walking Space", "Drawing Tools", "What Counts as Walking Space", "Sidewalk Outline", "Next: Obstructions"]);
    expect(steps.map((s) => s.placement)).toEqual(["bottom", "bottom", "left", "top", "top"]);
  });

  it("explains how to draw, edit and finish the outline", () => {
    const [canvas, tools, , shapes, next] = buildTourSteps(true, "sidewalk");
    expect(canvas.content).toMatch(/click the first point again to close the shape/);
    expect(canvas.content).toMatch(/Draw under any object standing on the sidewalk/);
    expect(tools.content).toMatch(/Finish shape/);
    expect(tools.content).toMatch(/Show photo only/);
    expect(shapes.content).toMatch(/tick No sidewalk/);
    expect(shapes.content).toMatch(/Click one to select it on the photo and adjust its points/);
    expect(next.content).toMatch(/no shape is half drawn/);
    expect(next.content).toMatch(/a message tells you what to finish/);
  });

  it("gives Obstructions four steps: canvas, guide, list and confirmation, Submit", () => {
    expect(tourStepCount(true, "obstructions")).toBe(4);
    expect([...tourTargets(true, "obstructions")]).toEqual([".rp-stage", "#obstruction-guide", "#box-review-section", "button[type='submit']"]);
    const steps = buildTourSteps(true, "obstructions");
    expect(steps.map((s) => s.title)).toEqual(["Mark the Obstructions", "What Counts as an Obstruction", "Which of These Obstruct", "Submit"]);
    expect(steps.map((s) => s.placement)).toEqual(["bottom", "left", "top", "top"]);
  });

  it("explains marking, the annotator's own judgment and the confirmation", () => {
    const [canvas, guide, list, submit] = buildTourSteps(true, "obstructions");
    expect(canvas.content).toMatch(/obstructs the sidewalk for you/);
    expect(canvas.content).toMatch(/It turns red/);
    expect(guide.content).toMatch(/Judge for yourself/);
    expect(list.content).toMatch(/tick the box to confirm/);
    expect(submit.content).toMatch(/the box is ticked/);
  });

  it("puts the Sidewalk beacons for the photo and toolbar to their left, and the rest above", () => {
    expect(tourBeaconPlacements(true, "sidewalk")).toEqual(["left", "left", "top", "top", "top"]);
    expect(tourBeaconPlacements(true, "obstructions")).toEqual(["top", "top", "top", "top"]);
    expect(tourBeaconPlacements(true, "objects")).toEqual(["top", "top", "top", "top"]);
    expect(tourBeaconPlacements(false)).toEqual(["top", "top", "bottom", "top", "top"]);
  });

  it("has one beacon and one target per tour step for every tour", () => {
    for (const [isAnnotator, step] of [[false, "objects"], [true, "objects"], [true, "sidewalk"], [true, "obstructions"]]) {
      const steps = buildTourSteps(isAnnotator, step);
      expect(steps).toHaveLength(tourStepCount(isAnnotator, step));
      expect(tourBeaconPlacements(isAnnotator, step)).toHaveLength(steps.length);
      expect(steps.map((s) => s.target)).toEqual([...tourTargets(isAnnotator, step)]);
    }
  });

  it("gives contributors the same tour whatever the step, and falls back to Objects for an unknown step", () => {
    expect(buildTourSteps(false, "sidewalk")).toEqual(buildTourSteps(false));
    expect(buildTourSteps(true, "nope")).toEqual(buildTourSteps(true, "objects"));
    expect(buildTourSteps(true)).toEqual(buildTourSteps(true, "objects"));
  });

  it("returns a copy of the beacon placements", () => {
    const placements = tourBeaconPlacements(true, "sidewalk");
    placements[0] = "bottom";
    expect(tourBeaconPlacements(true, "sidewalk")[0]).toBe("left");
  });

  it("has no em dash or semicolon in the Sidewalk and Obstructions tours", () => {
    for (const step of ["sidewalk", "obstructions"]) {
      for (const s of buildTourSteps(true, step)) {
        expect(`${s.title} ${s.content}`).not.toMatch(/[—;]/);
      }
    }
  });
});
