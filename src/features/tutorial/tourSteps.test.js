import { describe, it, expect } from "vitest";
import {
  buildTourSteps,
  tourTargets,
  tourStepCount,
  tourInputFor,
  tourWordsFor,
  PHONE_FULL_SCREEN_SENTENCE,
  TABLET_FULL_SCREEN_SENTENCE,
  FULL_SCREEN_TIP,
  CONTRIBUTOR_BUDGET,
} from "./tourSteps";
import { SIDEWALK_QUESTION_COPY } from "@/features/annotate/sidewalkQuestionCopy";

// A contributor step's words: intro, points, after (S16b) and note (S16)
const wordsOf = (step) => [step.intro, ...step.points, step.after, step.note].filter(Boolean);
const countWords = (text) => text.split(/\s+/).filter(Boolean).length;
// Every contributor tour as it can be shown: pointer, pointer said for a finger, touch on a phone and on a tablet
const CONTRIBUTOR_TOURS = [
  ["pointer", {}],
  ["pointer", { words: "touch" }],
  ["touch", {}],
  ["touch", { phone: true }],
  ["touch", { tablet: true }],
];

describe("tour steps", () => {
  // S16 (3 Nov 2026): the path step is new, and Step 1's instructions are its target
  it("gives contributors six steps at the six targets", () => {
    expect(tourStepCount(false)).toBe(6);
    expect([...tourTargets(false)]).toEqual([
      ".rp-stage",
      "#step1-instructions",
      "#box-review-section",
      ".rp-stage",
      "#scene-level-section",
      "button[type='submit']",
    ]);
    const steps = buildTourSteps(false);
    expect(steps.map((s) => s.title)).toEqual([
      "Check Each Box",
      "What Counts as the Path",
      "Your Answers",
      "Severity",
      "Scene-Level Assessment",
      // The button reads Next Image, not Submit (12 Oct 2026)
      "Next Image",
    ]);
    // Check Each Box right of the photo (S16b): below it, it could not be read without scrolling
    expect(steps.map((s) => s.placement)).toEqual(["right", "bottom", "top", "bottom", "top", "top"]);
  });

  // S16b (3 Nov 2026): never below the photo, and over its right side where there is no room on the right
  it("keeps Check Each Box beside the photo: no flip below it, and a slide over it or up and down into the screen", () => {
    for (const words of ["pointer", "touch"]) {
      const [check, ...rest] = buildTourSteps(false, "objects", "pointer", { words });
      expect(check.floatingOptions).toEqual({ flipOptions: false, shiftOptions: { crossAxis: true } });
      for (const s of rest) expect(s).not.toHaveProperty("floatingOptions");
    }
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

  // S16b (3 Nov 2026): Rans's wording
  it("lists the two questions, with no line on the dashed boxes (Rans, 3 Nov 2026)", () => {
    const [check] = buildTourSteps(false);
    expect(check).not.toHaveProperty("intro");
    expect(check.points).toEqual([
      "Click a box and check its label.",
      `Question 1 asks only where it is: “${SIDEWALK_QUESTION_COPY.question}”`,
      "Question 2 asks whether it obstructs the path for you.",
      "Nothing real in it? Click Not an object.",
    ]);
    expect(check).not.toHaveProperty("after");
    expect(check.note).toBe("Missed one? Click and drag to box it.");
  });

  it("adds a step on what counts as the path, the nearest sidewalk only, to both tours, with no note", () => {
    for (const input of ["pointer", "touch"]) {
      const path = buildTourSteps(false, "objects", input)[1];
      expect(path.title).toBe("What Counts as the Path");
      expect(path.points).toEqual([...SIDEWALK_QUESTION_COPY.pathPoints]);
      expect(path.points.join(" ")).toContain("Only the one nearest you counts. Answer No for objects on a farther one.");
      for (const key of ["intro", "after", "note"]) expect(path).not.toHaveProperty(key);
    }
    expect(buildTourSteps(false)[1].target).toBe("#step1-instructions");
  });

  it("points contributors' answers step at the lists under the photo, with no list of its own", () => {
    const answers = buildTourSteps(false)[2];
    expect(answers.target).toBe("#box-review-section");
    expect(answers.title).toBe("Your Answers");
    expect(answers.intro).toBe("Every answer goes into a list under the photo.");
    expect(answers.points).toEqual([]);
    // Hide all and Show all named too (Rans, 3 Nov 2026)
    expect(answers.after).toBe("Click a name to open it and change the answer. Click the eye to hide a box while you work on the boxes around it. Click Hide all to hide all the boxes on the photo. Click Show all to show them again.");
    expect(answers).not.toHaveProperty("note");
  });

  it("points the contributor severity step at the photo, with the scale and no intro", () => {
    const severity = buildTourSteps(false)[3];
    expect(severity.title).toBe("Severity");
    expect(severity.target).toBe(".rp-stage");
    expect(severity.placement).toBe("bottom");
    expect(severity).not.toHaveProperty("intro");
    expect(severity.points).toEqual([
      "Rate how much it blocks you, from 1 (a minor inconvenience) to 5 (it completely blocks the path).",
      "Click Confirm.",
      "To change it later, open the box and move the scale.",
    ]);
  });

  it("keeps the joined text as `content`: the intro, the points as sentences, after, then the note", () => {
    for (const [input, options] of CONTRIBUTOR_TOURS) {
      for (const s of buildTourSteps(false, "objects", input, options)) {
        const sentences = s.points.map((p) => (/[.?!”]$/.test(p) ? p : `${p}.`));
        expect(s.content).toBe([s.intro, ...sentences, s.after, s.note].filter(Boolean).join(" "));
      }
    }
    expect(buildTourSteps(false)[0].content).toBe(`Click a box and check its label. Question 1 asks only where it is: “${SIDEWALK_QUESTION_COPY.question}” Question 2 asks whether it obstructs the path for you. Nothing real in it? Click Not an object. Missed one? Click and drag to box it.`);
    expect(buildTourSteps(false)[2].content).toBe(`Every answer goes into a list under the photo. ${buildTourSteps(false)[2].after}`);
  });

  it("keeps every contributor step within the budget: 80 words, 5 points, 18 words a point", () => {
    expect(CONTRIBUTOR_BUDGET).toEqual({ words: 80, points: 5, wordsPerPoint: 18 });
    for (const [input, options] of CONTRIBUTOR_TOURS) {
      for (const s of buildTourSteps(false, "objects", input, options)) {
        // The question's own words are counted with the rest
        expect(countWords(wordsOf(s).join(" ")), `${input} ${s.title}`).toBeLessThanOrEqual(80);
        expect(s.points.length, s.title).toBeLessThanOrEqual(5);
        for (const point of s.points) expect(countWords(point), point).toBeLessThanOrEqual(18);
      }
    }
  });

  it("drops the wording Rans cut (S16b), on every contributor tour", () => {
    for (const [input, options] of CONTRIBUTOR_TOURS) {
      const text = buildTourSteps(false, "objects", input, options).map((s) => s.content).join(" ");
      expect(text).not.toContain("A No is just as useful");
      expect(text).not.toMatch(/for yourself, traveling/);
      expect(text).not.toMatch(/a scale opens/);
      expect(text).not.toMatch(/model's guesses/);
      expect(text).not.toMatch(/dashed yellow boxes are suggested/i);
      expect(text).not.toMatch(/Finish Session/);
      expect(text).not.toMatch(/double-tap/);
    }
  });

  it("has no em dash or semicolon in any contributor step", () => {
    for (const [input, options] of CONTRIBUTOR_TOURS) {
      for (const s of buildTourSteps(false, "objects", input, options)) {
        expect([s.title, ...wordsOf(s), s.content].join(" ")).not.toMatch(/[—;]/);
      }
    }
  });

  it("tells contributors that Not an object is a button, not a category (7 Oct 2026)", () => {
    const [check] = buildTourSteps(false);
    expect(check.points).toContain("Nothing real in it? Click Not an object.");
    expect(check.content).not.toContain("from the list. You can");
  });

  it("leaves annotator steps as one paragraph, with no list", () => {
    for (const step of ["objects", "sidewalk", "obstructions"]) {
      for (const input of ["pointer", "touch"]) {
        for (const s of buildTourSteps(true, step, input)) {
          expect(s.content).toBeTruthy();
          for (const key of ["intro", "points", "after", "note", "fitBesideTarget"]) expect(s).not.toHaveProperty(key);
        }
      }
    }
  });

  it("names what each role's last step needs and never says the button is disabled", () => {
    const contributorSubmit = buildTourSteps(false).at(-1);
    const annotatorNext = buildTourSteps(true).at(-1);
    for (const step of [contributorSubmit, annotatorNext]) {
      expect(step.content).not.toMatch(/disabled/i);
      expect(step.content).not.toMatch(/accepted or rejected/);
    }
    expect(annotatorNext.content).toMatch(/a message tells you what to finish/);
    expect(contributorSubmit.title).toBe("Next Image");
    // No list and no intro (S16b)
    expect(contributorSubmit.points).toEqual([]);
    for (const key of ["intro", "note"]) expect(contributorSubmit).not.toHaveProperty(key);
    // Rans's two sentences (3 Nov 2026), without Finish Session
    expect(contributorSubmit.after).toBe("Click Next Image once every box has an answer. If something is missing, there will be a warning to specify what's missing.");
    expect(contributorSubmit.content).not.toMatch(/Finish Session/);
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

  it("names the current four scene questions, rated on the sidewalk nearest you (S16)", () => {
    for (const input of ["pointer", "touch"]) {
      const sceneStep = buildTourSteps(false, "objects", input).find((s) => s.title === "Scene-Level Assessment");
      expect(sceneStep.target).toBe("#scene-level-section");
      expect(sceneStep.intro).toBe("Then rate the sidewalk nearest you as a whole:");
      expect(sceneStep.points).toEqual(["Its width", "Its surface condition", "How comfortable it looks for walking", "Whether you could get along it yourself"]);
      expect(sceneStep.note).toMatch(/Choose None and the other three are skipped/);
      expect(sceneStep.content).not.toMatch(/whether a sidewalk is present/);
    }
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

  // No tour has beacons (S16b, 3 Nov 2026): a ? button runs it again on both layouts
  it("has one target per tour step for every tour, and no beacons anywhere", () => {
    for (const [isAnnotator, step] of [[false, "objects"], [true, "objects"], [true, "sidewalk"], [true, "obstructions"]]) {
      for (const input of ["pointer", "touch"]) {
        const steps = buildTourSteps(isAnnotator, step, input);
        expect(steps).toHaveLength(tourStepCount(isAnnotator, step, input));
        expect(steps.map((s) => s.target)).toEqual([...tourTargets(isAnnotator, step, input)]);
        for (const s of steps) expect(s.skipBeacon).toBe(true);
      }
    }
  });

  it("gives contributors the same tour whatever the step, and falls back to Objects for an unknown step", () => {
    expect(buildTourSteps(false, "sidewalk")).toEqual(buildTourSteps(false));
    expect(buildTourSteps(true, "nope")).toEqual(buildTourSteps(true, "objects"));
    expect(buildTourSteps(true)).toEqual(buildTourSteps(true, "objects"));
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
  it("gives contributors seven steps at seven targets, and leaves the other tours as they were", () => {
    expect(tourStepCount(false, "objects", "touch")).toBe(7);
    expect([...tourTargets(false, "objects", "touch")]).toEqual([
      ".rp-stage",
      ".rp-stage",
      "#add-box-button",
      // The lists in the sheet pulled up, Still to decide to the Obstructions card, with no padding (S16b)
      "#box-review-lists",
      "#box-review-chips-peek",
      "#scene-level-section",
      "button[type='submit']",
    ]);
    const steps = buildTourSteps(false, "objects", "touch");
    expect(steps.map((s) => s.title)).toEqual([
      "Check Each Box",
      "What Counts as the Path",
      "Add a Box",
      "Your Answers",
      "Severity",
      "Scene-Level Assessment",
      "Next Image",
    ]);
    // Add a Box and Your Answers point at their targets (S16b): a centred card has no highlight
    expect(steps.map((s) => s.placement)).toEqual(["center", "center", "top", "top", "top", "center", "top"]);
    expect(steps.map((s) => s.fitBesideTarget)).toEqual([undefined, undefined, true, true, undefined, undefined, undefined]);
    expect(steps.at(-1).after).toBe("Tap Next Image once every box has an answer. If something is missing, there will be a warning to specify what's missing.");
    expect(steps.map((s) => s.target)).toEqual([...tourTargets(false, "objects", "touch")]);
    // The answers and Step 2 are in the part of the sheet pulled down, and only those steps say so
    expect(steps.map((s) => s.sheet)).toEqual([undefined, undefined, undefined, "full", undefined, "full", undefined]);
    // The pointer tour is as it was
    expect(buildTourSteps(false, "objects", "pointer")).toEqual(buildTourSteps(false));
    expect(tourStepCount(false, "objects", "pointer")).toBe(6);
  });

  it("says the desktop wording with Tap, and Add box in its own step", () => {
    const [check, path, add, answers, severity, , next] = buildTourSteps(false, "objects", "touch");
    const desktop = buildTourSteps(false);
    expect(check.points).toEqual(desktop[0].points.map((p) => p.replace("Click", "Tap")));
    for (const key of ["after", "note"]) expect(check).not.toHaveProperty(key);
    expect(path.points).toEqual(desktop[1].points);
    expect(add.points).toEqual([
      "Tap Add box. A box appears in the middle of the photo.",
      "Drag its four corners to fit the object. A magnifier shows where each corner sits.",
      "Pick its category and answer both questions.",
    ]);
    expect(add.note).toBe("Pinch to zoom in on small objects.");
    expect(answers.intro).toBe("Every object is listed at the bottom of the screen.");
    expect(answers.points).toEqual([]);
    expect(answers.after).toBe("Pull the list up to see them all. Tap a name to open it and change the answer. Tap the eye to hide a box while you work on the boxes around it. Tap Hide all to hide all the boxes on the photo. Tap Show all to show them again.");
    expect(answers).not.toHaveProperty("note");
    expect(severity).not.toHaveProperty("intro");
    expect(severity.points).toEqual([
      "Rate how much it blocks you, from 1 (a minor inconvenience) to 5 (it completely blocks the path).",
      "Tap Confirm.",
      "To change it later, open the box and move the scale.",
    ]);
    expect(next.points).toEqual([]);
    expect(next.after).toBe(desktop.at(-1).after.replace("Click", "Tap"));
  });

  it("says how to show a hidden box again in the annotator tour, unchanged (14 Oct 2026)", () => {
    const steps = buildTourSteps(true, "objects", "touch");
    expect(steps[0].content).toContain("While a box is open it is the only box on the photo, and the others come back when you close it.");
    expect(steps[1].content).toContain("Until you close it, it is the only box on the photo.");
    expect(steps[2].content).toContain("To show a hidden box again, double-tap where it was.");
    expect(steps[2].content).toContain("with what is left first: the suggestions still to decide and the boxes with no category yet");
    expect(steps[2].content).toContain("Hide all and Show all, beside the step's name");
  });

  it("never says click, and has no em dash or semicolon", () => {
    for (const options of [{}, { phone: true }, { tablet: true }]) {
      for (const s of buildTourSteps(false, "objects", "touch", options)) {
        const text = [s.title, ...wordsOf(s), s.content].join(" ");
        expect(text).not.toMatch(/click/i);
        expect(text).not.toMatch(/[—;]/);
      }
    }
  });
});

// 12 Oct 2026: which tour and which wording
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
  // Every field of each step but its words
  const WORDS = ["content", "intro", "points", "after", "note"];
  const strip = (steps) => steps.map((step) => Object.fromEntries(Object.entries(step).filter(([key]) => !WORDS.includes(key))));

  it("never says click, with no em dash or semicolon, and keeps every target, step, title, placement and beacon", () => {
    for (const [isAnnotator, step] of TOURS) {
      for (const s of touch(isAnnotator, step)) {
        const text = [s.title, s.content, ...(s.points ? wordsOf(s) : [])].join(" ");
        expect(text).not.toMatch(/click/i);
        expect(text).not.toMatch(/[—;]/);
      }
      const plain = buildTourSteps(isAnnotator, step);
      expect(strip(touch(isAnnotator, step))).toEqual(strip(plain));
      expect(buildTourSteps(isAnnotator, step, "pointer", { words: "pointer" })).toEqual(plain);
      // The touch tours ignore the wording
      expect(buildTourSteps(isAnnotator, step, "touch", { words: "touch" })).toEqual(buildTourSteps(isAnnotator, step, "touch"));
      expect(buildTourSteps(isAnnotator, step, "touch", { words: "pointer" })).toEqual(buildTourSteps(isAnnotator, step, "touch"));
    }
  });

  it("gives contributors the touch words for Check Each Box, the answers, severity and Next Image, and leaves the path and Step 2 as they are", () => {
    const steps = touch(false, "objects");
    const plain = buildTourSteps(false);
    expect(steps[0].points[0]).toBe("Tap a box and check its label.");
    expect(steps[0].points[3]).toBe("Nothing real in it? Tap Not an object.");
    // A finger cannot draw by dragging: Add box
    expect(steps[0].note).toBe("Missed one? Tap Add box to box it.");
    expect(steps[2].after).toBe("Tap a name to open it and change the answer. Tap the eye to hide a box while you work on the boxes around it. Tap Hide all to hide all the boxes on the photo. Tap Show all to show them again.");
    expect(steps[3].points.slice(1)).toEqual(["Tap Confirm.", "To change it later, open the box and move the scale."]);
    expect(steps[5].after).toMatch(/^Tap Next Image once/);
    for (const i of [1, 4]) expect(steps[i].content).toBe(plain[i].content);
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
    for (const [isAnnotator, step] of [[true, "objects"], [true, "sidewalk"], [true, "obstructions"]]) {
      for (const s of buildTourSteps(isAnnotator, step, "touch")) {
        const fillsScreen = s.target === ".rp-stage" || s.sheet === "full";
        expect(s.placement).toBe(fillsScreen ? "center" : "top");
      }
    }
    // Contributors: the photo and Step 2 centred, every other step at its
    // target, Your Answers too though its lists are pulled up (S16b)
    for (const s of buildTourSteps(false, "objects", "touch")) {
      const centred = s.target === ".rp-stage" || s.target === "#scene-level-section";
      expect(s.placement, s.title).toBe(centred ? "center" : "top");
    }
    // The desktop tours keep theirs
    expect(buildTourSteps(false)[0].placement).toBe("right");
  });

  // 12 Oct 2026: the tour's own scrolling moved the phone screen, which is fixed
  // in place, and left it shifted. The sheet does the scrolling there.
  it("leaves scrolling to the sheet on touch, and to the tour on the desktop layout", () => {
    for (const [isAnnotator, step] of [[false, "objects"], [true, "objects"], [true, "sidewalk"], [true, "obstructions"]]) {
      for (const s of buildTourSteps(isAnnotator, step, "touch")) expect(s.skipScroll).toBe(true);
      for (const s of buildTourSteps(isAnnotator, step, "pointer")) expect(s).not.toHaveProperty("skipScroll");
      // Only Check Each Box positions itself on the desktop layout (S16b)
      for (const s of buildTourSteps(isAnnotator, step, "pointer").filter((x) => x.title !== "Check Each Box")) expect(s).not.toHaveProperty("floatingOptions");
      for (const s of buildTourSteps(isAnnotator, step, "pointer", { words: "touch" })) expect(s).not.toHaveProperty("skipScroll");
    }
  });

  // S16 (3 Nov 2026): Your Answers ran off the top of a phone in the first
  // pilot session, its × with it. The tour library flips a card with no room
  // above its target, but only slides it sideways.
  it("lets every touch card slide up or down into the screen, for both roles", () => {
    for (const [isAnnotator, step] of [[false, "objects"], [true, "objects"], [true, "sidewalk"], [true, "obstructions"]]) {
      for (const s of buildTourSteps(isAnnotator, step, "touch")) {
        // Your Answers may use the whole screen, not only the sheet's scrolling
        // part, and follows its lists as the sheet settles (S16b)
        const answers = !isAnnotator && s.title === "Your Answers";
        expect(s.floatingOptions, s.title).toEqual(answers
          ? { shiftOptions: { crossAxis: true, boundary: "clippingAncestors" }, autoUpdate: { animationFrame: true } }
          : { shiftOptions: { crossAxis: true } });
      }
    }
  });

  // 12 Oct 2026: tablets get the full-screen photo too, on either layout
  it("adds the tablet's full-screen sentence to the first step of a tablet's touch tour", () => {
    expect(TABLET_FULL_SCREEN_SENTENCE).toBe("The button at the bottom right of the photo shows the photo full screen.");
    for (const [isAnnotator, step] of [[true, "objects"], [true, "sidewalk"], [true, "obstructions"]]) {
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
    for (const [isAnnotator, step] of [[true, "objects"], [true, "sidewalk"], [true, "obstructions"]]) {
      const phone = buildTourSteps(isAnnotator, step, "touch", { phone: true });
      const tablet = buildTourSteps(isAnnotator, step, "touch");
      expect(phone[0].content).toBe(`${tablet[0].content} ${PHONE_FULL_SCREEN_SENTENCE}`);
      expect(phone.slice(1)).toEqual(tablet.slice(1));
      expect(tablet.map((s) => s.content).join(" ")).not.toContain("full screen");
      // Never on a pointer tour
      expect(buildTourSteps(isAnnotator, step, "pointer", { phone: true })).toEqual(buildTourSteps(isAnnotator, step));
    }
  });

  // S16: the contributors' two sentences, shortened into one tip for both
  it("gives the contributor tour's first step the full-screen tip as its note, on a phone and a tablet alike", () => {
    expect(FULL_SCREEN_TIP).toBe("Tip: the photo's bottom-right button goes full screen.");
    const plain = buildTourSteps(false, "objects", "touch");
    for (const options of [{ phone: true }, { tablet: true }, { phone: true, tablet: true }]) {
      const steps = buildTourSteps(false, "objects", "touch", options);
      expect(steps[0].note).toBe(FULL_SCREEN_TIP);
      expect(steps[0].content.endsWith(FULL_SCREEN_TIP)).toBe(true);
      expect(steps[0].content).not.toContain(PHONE_FULL_SCREEN_SENTENCE);
      expect(steps.slice(1)).toEqual(plain.slice(1));
    }
    expect(plain[0]).not.toHaveProperty("note");
    expect(plain.map((s) => s.content).join(" ")).not.toContain("full screen");
    // Never on a pointer tour
    expect(buildTourSteps(false, "objects", "pointer", { phone: true, tablet: true })).toEqual(buildTourSteps(false));
  });
});


// S17 (4 Nov 2026): a confirmed obstruction opens on its severity scale, and
// the panel has no Change any more
describe("changing a severity later", () => {
  it("says to move the scale on every contributor tour, and never to click or tap Change", () => {
    for (const [input, options] of CONTRIBUTOR_TOURS) {
      const steps = buildTourSteps(false, "objects", input, options);
      const severity = steps.find((s) => s.title === "Severity");
      expect(severity.points).toContain("To change it later, open the box and move the scale.");
      for (const s of steps) expect(s.content).not.toMatch(/(click|tap) Change/i);
    }
  });
});
