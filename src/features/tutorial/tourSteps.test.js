import { describe, it, expect } from "vitest";
import {
  buildTourSteps,
  tourTargets,
  tourStepCount,
  tourBeaconPlacements,
  tourBeaconTargets,
  tourInputFor,
  tourWordsFor,
  tourShowsBeacons,
  PHONE_FULL_SCREEN_SENTENCE,
  TABLET_FULL_SCREEN_SENTENCE,
} from "./tourSteps";

describe("tour steps", () => {
  it("gives contributors five steps at the five targets", () => {
    expect(tourStepCount(false)).toBe(5);
    expect([...tourTargets(false)]).toEqual([
      ".rp-stage",
      "#box-review-section",
      ".rp-stage",
      "#scene-level-section",
      "button[type='submit']",
    ]);
    const steps = buildTourSteps(false);
    expect(steps.map((s) => s.title)).toEqual([
      "Annotation Canvas",
      "Your Answers",
      "Severity",
      "Scene-Level Assessment",
      // The button reads Next Image, not Submit (12 Oct 2026)
      "Next Image",
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
    // Hiding boxes on the photo (8 Oct 2026)
    expect(objects.content).toContain("Click the eye beside an object to hide its box on the photo");
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

  it("keeps the contributor wording for the canvas step", () => {
    const [canvas] = buildTourSteps(false);
    expect(canvas.content).toMatch(/^Dashed yellow boxes are model suggestions\./);
  });

  it("points contributors' second step at the lists of answers (7 Oct 2026)", () => {
    const answers = buildTourSteps(false)[1];
    expect(answers.target).toBe("#box-review-section");
    expect(answers.title).toBe("Your Answers");
    expect(answers.content).toBe(
      "Every object you answer is listed under the photo, in Not obstructions or Obstructions. Boxes you draw are listed there too. Answering No is just as valuable as answering Yes. It tells us the object is there but does not get in the way. Click any object to change its answer. Click the eye beside an object to hide its box on the photo while you work on boxes around it."
    );
  });

  it("points the contributor severity step at the photo, where the scale opens (8 Oct 2026)", () => {
    const severity = buildTourSteps(false)[2];
    expect(severity.title).toBe("Severity");
    expect(severity.target).toBe(".rp-stage");
    expect(severity.placement).toBe("bottom");
    expect(severity.content).toContain("a scale opens on the photo beside the box");
    expect(severity.content).toContain("Confirm");
    expect(severity.content).not.toContain(";");
  });

  it("tells contributors that Not an object is a button, not a category (7 Oct 2026)", () => {
    const [canvas] = buildTourSteps(false);
    expect(canvas.content).toContain("click Not an object");
    expect(canvas.content).not.toContain("from the list. You can");
  });

  it("names what each role's last step needs and never says the button is disabled", () => {
    const contributorSubmit = buildTourSteps(false).at(-1);
    const annotatorNext = buildTourSteps(true).at(-1);
    for (const step of [contributorSubmit, annotatorNext]) {
      expect(step.content).toMatch(/a message tells you what to finish/);
      expect(step.content).not.toMatch(/disabled/i);
      expect(step.content).not.toMatch(/accepted or rejected/);
    }
    expect(contributorSubmit.title).toBe("Next Image");
    expect(contributorSubmit.content).toMatch(/^Click Next Image when/);
    expect(contributorSubmit.content).toMatch(/On the last image the button reads Finish Session\./);
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
    // 13 Oct 2026: the tools change with what the annotator is doing, and are
    // named by the labels on their buttons
    expect(tools.content).toBe("These tools change with what you are doing. While you draw a shape, Finish closes it, and Undo and Cancel fix mistakes. Click a finished shape to select it, then drag its points, drag the handle in the middle of an edge to add a point, or use Delete point and Delete shape. Photo only hides the outline's fill so you can check the edges. The object boxes are hidden here and come back in the next step.");
    for (const old of ["Finish shape", "Undo point", "Cancel shape", "Show photo only"]) expect(tools.content).not.toContain(old);
    expect(shapes.content).toMatch(/tick No sidewalk/);
    expect(shapes.content).toMatch(/Click one to select it on the photo and adjust its points/);
    expect(next.content).toMatch(/no shape is half drawn/);
    expect(next.content).toMatch(/a message tells you what to finish/);
  });

  it("gives Obstructions four steps: canvas, guide, list and confirmation, Next Image", () => {
    expect(tourStepCount(true, "obstructions")).toBe(4);
    expect([...tourTargets(true, "obstructions")]).toEqual([".rp-stage", "#obstruction-guide", "#box-review-section", "button[type='submit']"]);
    const steps = buildTourSteps(true, "obstructions");
    expect(steps.map((s) => s.title)).toEqual(["Mark the Obstructions", "What Counts as an Obstruction", "Which of These Obstruct", "Next Image"]);
    expect(steps.at(-1).content).toBe("Move on when every obstructing object is marked and the box is ticked. On the last image the button reads Finish Session. If something is missing, a message tells you what to finish.");
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
    // The severity step's beacon sits beside the photo's left edge (8 Oct 2026)
    expect(tourBeaconPlacements(false)).toEqual(["top", "top", "left", "top", "top"]);
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

// Contributors on a phone or tablet (9 Oct 2026)
describe("the touch tour", () => {
  it("gives contributors six steps at six targets, and leaves the other tours as they were", () => {
    expect(tourStepCount(false, "objects", "touch")).toBe(6);
    expect([...tourTargets(false, "objects", "touch")]).toEqual([
      ".rp-stage",
      "#add-box-button",
      "#box-review-section-peek",
      "#box-review-obstructions-peek",
      "#scene-level-section",
      "button[type='submit']",
    ]);
    const steps = buildTourSteps(false, "objects", "touch");
    expect(steps.map((s) => s.title)).toEqual([
      "Annotation Canvas",
      "Add a Box",
      "Your Answers",
      "Severity",
      "Scene-Level Assessment",
      "Next Image",
    ]);
    expect(steps.at(-1).content).toMatch(/^Tap Next Image when/);
    expect(steps.at(-1).content).toContain("Finish Session");
    expect(steps.map((s) => s.target)).toEqual([...tourTargets(false, "objects", "touch")]);
    expect(tourBeaconPlacements(false, "objects", "touch")).toHaveLength(6);
    // Step 2 is in the part of the sheet pulled down, and only that step says so
    expect(steps.map((s) => s.sheet)).toEqual([undefined, undefined, undefined, undefined, "full", undefined]);
    // The pointer tour is as it was
    expect(buildTourSteps(false, "objects", "pointer")).toEqual(buildTourSteps(false));
    expect(tourStepCount(false, "objects", "pointer")).toBe(5);
  });

  it("explains Add box, the corners, the magnifier and pinch to zoom", () => {
    const text = buildTourSteps(false, "objects", "touch").map((s) => s.content).join(" ");
    expect(text).toContain("tap Add box");
    expect(text).toContain("four corners");
    expect(text).toContain("magnifier");
    expect(text).toContain("Pinch to zoom");
    expect(text).toContain("bottom of the screen");
  });

  it("says the open or new box is the only one on the photo, and how to show a hidden box again (14 Oct 2026)", () => {
    for (const isAnnotator of [false, true]) {
      const steps = buildTourSteps(isAnnotator, "objects", "touch");
      expect(steps[0].content).toContain("While a box is open it is the only box on the photo, and the others come back when you close it.");
      expect(steps[1].content).toContain("Until you close it, it is the only box on the photo.");
      expect(steps[2].content).toContain("To show a hidden box again, double-tap where it was.");
    }
    const annotatorList = buildTourSteps(true, "objects", "touch")[2].content;
    expect(annotatorList).toContain("with the suggestions still to decide first");
    expect(annotatorList).toContain("Hide all and Show all, beside the step's name");
    expect(buildTourSteps(false, "objects", "touch")[2].content).toContain("Hide all and Show all, beside the step's name");
  });

  it("puts no beacon beside its target", () => {
    expect(tourBeaconPlacements(false, "objects", "touch").every((p) => p === "top" || p === "bottom")).toBe(true);
  });

  it("never says click, and has no em dash or semicolon", () => {
    for (const s of buildTourSteps(false, "objects", "touch")) {
      expect(`${s.title} ${s.content}`).not.toMatch(/click/i);
      expect(`${s.title} ${s.content}`).not.toMatch(/[—;]/);
    }
  });

  it("measures the Step 2 beacon on the sheet's Step 2 line when there is one", () => {
    const beaconTargets = tourBeaconTargets(false, "objects", "touch");
    expect(beaconTargets).toHaveLength(6);
    expect(beaconTargets[4]).toBe("#scene-level-peek, #scene-level-section");
    expect([...tourBeaconTargets(false)]).toEqual([...tourTargets(false)]);
  });

});

// 12 Oct 2026: which tour and which wording, and no beacons on touch
describe("choosing the tour and its wording", () => {
  it("gives the sheet layout the touch tour and the desktop layout the pointer tour", () => {
    expect(tourInputFor("sheet")).toBe("touch");
    expect(tourInputFor("desktop")).toBe("pointer");
  });

  it("says tap on the sheet layout, and on the desktop layout when a finger is the primary pointer", () => {
    expect(tourWordsFor({ layout: "sheet", coarsePointer: false })).toBe("touch");
    expect(tourWordsFor({ layout: "desktop", coarsePointer: true })).toBe("touch");
    expect(tourWordsFor({ layout: "desktop", coarsePointer: false })).toBe("pointer");
  });

  it("shows beacons for the pointer tours only", () => {
    expect(tourShowsBeacons("pointer")).toBe(true);
    expect(tourShowsBeacons("touch")).toBe(false);
  });
});

// An iPad held sideways: the desktop layout's tours, said for a finger
describe("the pointer tours with touch wording", () => {
  const TOURS = [
    [false, "objects"],
    [true, "objects"],
    [true, "sidewalk"],
    [true, "obstructions"],
  ];
  const touch = (isAnnotator, step) => buildTourSteps(isAnnotator, step, "pointer", { words: "touch" });
  // Every field of each step but its content
  const strip = (steps) => steps.map((step) => Object.fromEntries(Object.entries(step).filter(([key]) => key !== "content")));

  it("never says click, with no em dash or semicolon, and keeps every target, step, title, placement and beacon", () => {
    for (const [isAnnotator, step] of TOURS) {
      for (const s of touch(isAnnotator, step)) {
        expect(`${s.title} ${s.content}`).not.toMatch(/click/i);
        expect(`${s.title} ${s.content}`).not.toMatch(/[—;]/);
      }
      const plain = buildTourSteps(isAnnotator, step);
      expect(strip(touch(isAnnotator, step))).toEqual(strip(plain));
      expect(buildTourSteps(isAnnotator, step, "pointer", { words: "pointer" })).toEqual(plain);
      // The touch tours ignore the wording
      expect(buildTourSteps(isAnnotator, step, "touch", { words: "touch" })).toEqual(buildTourSteps(isAnnotator, step, "touch"));
      expect(buildTourSteps(isAnnotator, step, "touch", { words: "pointer" })).toEqual(buildTourSteps(isAnnotator, step, "touch"));
    }
  });

  it("gives contributors the touch copy for the canvas, the answers, severity and Next Image, and leaves Step 2 as it is", () => {
    const steps = touch(false, "objects");
    const plain = buildTourSteps(false);
    expect(steps[0].content).toBe("Dashed yellow boxes are model suggestions. Tap each one, check that its label is right (change it from the list if it is not), then decide whether the object obstructs the sidewalk. If a box does not mark a real object, tap Not an object. To label an object the model missed, tap Add box at the bottom left of the photo and drag the new box's corners to fit it. Pinch to zoom in on small objects.");
    expect(steps[1].content).toBe("Every object you answer is listed under the photo, in Not obstructions or Obstructions. Boxes you add are listed there too. Answering No is just as valuable as answering Yes. It tells us the object is there but does not get in the way. Tap any object to change its answer. Tap the eye beside an object to hide its box on the photo while you work on boxes around it. To show a hidden box again, double-tap where it was.");
    expect(steps[2].content).toBe("When you answer Yes, a scale opens on the photo beside the box. Rate how severely the object blocks passage, from 1 (a minor inconvenience) to 5 (it completely blocks the path), then tap Confirm. To change it later, open the box and tap Change.");
    expect(steps[3].content).toBe(plain[3].content);
    expect(steps[4].content).toBe("Tap Next Image when every suggested box has been decided (Yes, No, or Not an object), every box has a category, and all four scene-level questions are answered. On the last image the button reads Finish Session. If something is missing, a message tells you what to finish.");
  });

  it("gives annotators the touch copy on the steps that said click, and leaves the others as they are", () => {
    const objects = touch(true, "objects");
    const plainObjects = buildTourSteps(true, "objects");
    expect(objects[0].content).toBe("Box every object from the 18 categories that you can see anywhere in the image, on the sidewalk or not. Dashed yellow boxes are suggestions. Tap each one, check its category and fit the box if it is loose, then tap Keep, or tap Not an object if it marks nothing real. For every object the suggestions missed, tap Add box at the bottom left of the photo and drag the new box's corners to fit it. Pinch to zoom in on small objects.");
    expect(objects[1].content).toBe(plainObjects[1].content);
    expect(objects[2].content).toBe("This list shows every box in the image and which suggestions you still need to decide. Tap a box in the list to select it. Tap the eye beside an object to hide its box on the photo while you work on boxes around it. To show a hidden box again, double-tap where it was.");
    expect(objects[3].content).toBe("When every suggested box is kept or marked Not an object and every box has a category, tap Next: Sidewalk. You then outline the walking space, and after that mark which objects obstruct the sidewalk for you. If something is missing, a message tells you what to finish.");

    const sidewalk = touch(true, "sidewalk");
    const plainSidewalk = buildTourSteps(true, "sidewalk");
    expect(sidewalk[0].content).toBe("Tap points around the sidewalk to outline it, then tap the first point again to close the shape. To place a point exactly, drag your finger and let go where the magnifier shows the right spot. Draw under any object standing on the sidewalk, as if it were not there. Separate stretches, such as both sides of a street, are separate shapes.");
    expect(sidewalk[1].content).toBe("These tools change with what you are doing. While you draw a shape, Finish closes it, and Undo and Cancel fix mistakes. Tap a finished shape to select it, then drag its points, tap the dot in the middle of an edge to add a point, or use Delete point and Delete shape. Photo only hides the outline's fill so you can check the edges. The object boxes are hidden here and come back in the next step.");
    expect(sidewalk[2].content).toBe(plainSidewalk[2].content);
    expect(sidewalk[3].content).toBe("Every shape you draw is listed here. Tap one to select it on the photo and adjust its points, or tap its × to delete it. If the image has no sidewalk or pedestrian path, tick No sidewalk instead of drawing.");
    expect(sidewalk[4].content).toBe(plainSidewalk[4].content);

    const obstructions = touch(true, "obstructions");
    const plainObstructions = buildTourSteps(true, "obstructions");
    expect(obstructions[0].content).toBe("Tap every object that obstructs the sidewalk for you, traveling as you normally do. It turns red. Tap it again to unmark it. The boxes are locked here, so go back to fix a box or a category.");
    for (const i of [1, 2, 3]) expect(obstructions[i].content).toBe(plainObstructions[i].content);
  });

});

// Annotators on a phone or tablet (12 Oct 2026)
describe("the annotator touch tours", () => {
  const tour = (step, options) => buildTourSteps(true, step, "touch", options);

  it("gives Objects five steps, with What to Box in the part of the sheet pulled up", () => {
    expect([...tourTargets(true, "objects", "touch")]).toEqual([".rp-stage", "#add-box-button", "#box-review-section-peek", "#taxonomy-guide", "button[type='submit']"]);
    const steps = tour("objects");
    expect(steps.map((s) => s.title)).toEqual(["Annotation Canvas", "Add a Box", "Objects in This Image", "What to Box", "Next: Sidewalk"]);
    expect(steps.map((s) => s.sheet)).toEqual([undefined, undefined, undefined, "full", undefined]);
    expect(steps[1].content).toContain("Tap Add box for every object the suggestions missed.");
    expect(steps[4].content).toContain("tap Next.");
  });

  it("gives Sidewalk five steps, with the shapes card and the guide in the part pulled up", () => {
    expect([...tourTargets(true, "sidewalk", "touch")]).toEqual([".rp-stage", "#sidewalk-tools", "#sidewalk-shapes", "#sidewalk-guide", "button[type='submit']"]);
    const steps = tour("sidewalk");
    expect(steps.map((s) => s.title)).toEqual(["Outline the Walking Space", "Drawing Tools", "Sidewalk Outline", "What Counts as Walking Space", "Next: Obstructions"]);
    expect(steps.map((s) => s.sheet)).toEqual([undefined, undefined, "full", "full", undefined]);
    expect(steps[0].content).toContain("let go where the magnifier shows the right spot");
    expect(steps[1].content).toBe("These tools change with what you are doing. While you draw a shape, Finish closes it, and Undo and Cancel fix mistakes. Tap a finished shape to select it, then drag its points, tap a dot in the middle of an edge to add a point, or use Delete point and Delete shape. Photo only hides the fill so you can check the edges.");
  });

  it("gives Obstructions four steps, with the guide in the part pulled up, ending on Next Image", () => {
    expect([...tourTargets(true, "obstructions", "touch")]).toEqual([".rp-stage", "#box-review-section-peek", "#obstruction-guide", "button[type='submit']"]);
    const steps = tour("obstructions");
    expect(steps.map((s) => s.title)).toEqual(["Mark the Obstructions", "Which of These Obstruct", "What Counts as an Obstruction", "Next Image"]);
    expect(steps.map((s) => s.sheet)).toEqual([undefined, undefined, "full", undefined]);
    expect(steps.at(-1).content).toContain("Finish Session");
  });

  it("never says click, and has no em dash or semicolon", () => {
    for (const step of ["objects", "sidewalk", "obstructions"]) {
      expect(tourStepCount(true, step, "touch")).toBe(tour(step).length);
      for (const s of tour(step)) {
        expect(`${s.title} ${s.content}`).not.toMatch(/click/i);
        expect(`${s.title} ${s.content}`).not.toMatch(/[—;]/);
      }
    }
  });

  it("centres the tooltip on the steps that fill the screen: the photo, and a card in the pulled-up sheet", () => {
    for (const [isAnnotator, step] of [[false, "objects"], [true, "objects"], [true, "sidewalk"], [true, "obstructions"]]) {
      for (const s of buildTourSteps(isAnnotator, step, "touch")) {
        const fillsScreen = s.target === ".rp-stage" || s.sheet === "full";
        expect(s.placement).toBe(fillsScreen ? "center" : "top");
      }
    }
    // The desktop tours keep theirs
    expect(buildTourSteps(false)[0].placement).toBe("bottom");
  });

  // 12 Oct 2026: the tour's own scrolling moved the phone screen, which is fixed
  // in place, and left it shifted. The sheet does the scrolling there.
  it("leaves scrolling to the sheet on touch, and to the tour on the desktop layout", () => {
    for (const [isAnnotator, step] of [[false, "objects"], [true, "objects"], [true, "sidewalk"], [true, "obstructions"]]) {
      for (const s of buildTourSteps(isAnnotator, step, "touch")) expect(s.skipScroll).toBe(true);
      for (const s of buildTourSteps(isAnnotator, step, "pointer")) expect(s).not.toHaveProperty("skipScroll");
      for (const s of buildTourSteps(isAnnotator, step, "pointer", { words: "touch" })) expect(s).not.toHaveProperty("skipScroll");
    }
  });

  // 12 Oct 2026: tablets get the full-screen photo too, on either layout
  it("adds the tablet's full-screen sentence to the first step of a tablet's touch tour", () => {
    expect(TABLET_FULL_SCREEN_SENTENCE).toBe("The button at the bottom right of the photo shows the photo full screen.");
    for (const [isAnnotator, step] of [[false, "objects"], [true, "objects"], [true, "sidewalk"], [true, "obstructions"]]) {
      const plain = buildTourSteps(isAnnotator, step, "touch");
      const onTablet = buildTourSteps(isAnnotator, step, "touch", { tablet: true });
      expect(onTablet[0].content).toBe(`${plain[0].content} ${TABLET_FULL_SCREEN_SENTENCE}`);
      expect(onTablet.slice(1)).toEqual(plain.slice(1));
      // Never on a pointer tour, which no tablet gets, and a phone keeps its own sentence
      expect(buildTourSteps(isAnnotator, step, "pointer", { tablet: true })).toEqual(buildTourSteps(isAnnotator, step));
      expect(buildTourSteps(isAnnotator, step, "pointer", { words: "touch", tablet: true })).toEqual(buildTourSteps(isAnnotator, step, "pointer", { words: "touch" }));
      expect(buildTourSteps(isAnnotator, step, "touch", { phone: true, tablet: true })[0].content).not.toContain(TABLET_FULL_SCREEN_SENTENCE);
    }
  });

  it("adds the full-screen sentence to the first step on a phone only, for both roles", () => {
    expect(PHONE_FULL_SCREEN_SENTENCE).toBe("On a phone, the button at the bottom right of the photo shows the photo full screen, which you can also use with the phone held sideways.");
    for (const [isAnnotator, step] of [[false, "objects"], [true, "objects"], [true, "sidewalk"], [true, "obstructions"]]) {
      const phone = buildTourSteps(isAnnotator, step, "touch", { phone: true });
      const tablet = buildTourSteps(isAnnotator, step, "touch");
      expect(phone[0].content).toBe(`${tablet[0].content} ${PHONE_FULL_SCREEN_SENTENCE}`);
      expect(phone.slice(1)).toEqual(tablet.slice(1));
      expect(tablet.map((s) => s.content).join(" ")).not.toContain("full screen");
      // Never on a pointer tour
      expect(buildTourSteps(isAnnotator, step, "pointer", { phone: true })).toEqual(buildTourSteps(isAnnotator, step));
    }
  });
});

