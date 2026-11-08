import { describe, it, expect } from "vitest";
import TUTORIAL_IMAGES from "@/data/tutorialImages";
import { DEMO_IMAGES, DEMO_IMAGE_SIZE, ids } from "@/features/home/howItWorks/demoScript";
import { NOT_AN_OBJECT } from "@/util/suggestionJudgment";
import {
  PRACTICE_IDS,
  PRACTICE_STEPS,
  PRACTICE_STEP_COUNT,
  DRAW_TARGET,
  DRAW_MIN_IOU,
  PRACTICE_SELECTORS,
  SCENE_QUESTIONS,
  boxAnswered,
  drawTargetIoU,
  practiceDrawnBox,
  practiceStepDone,
  practiceStepSkipped,
  nextPracticeStep,
  practiceStepFor,
  practiceLockFor,
  practiceTargets,
} from "./practiceSteps";

/**
 * S19 (7 Nov 2026): the practice on the first tutorial photo, ten steps that
 * each wait for the contributor to do one thing, decided from the tool's
 * state. The photo and boxes are the home page preview's.
 */

const PHOTO = TUTORIAL_IMAGES[0];
const suggestion = (id, extra = {}) => {
  const box = PHOTO.annotationList.find((b) => b.id === id);
  return { id, comment: box.comment, editable: false, mark: { ...box.mark }, selected: false, isRejected: false, severity: null, ...extra };
};
const drawn = (mark, extra = {}) => ({ id: "drawn-1", comment: "---", editable: true, mark, selected: false, isRejected: false, severity: null, ...extra });
const EMPTY_SCENE = { sidewalkWidth: null, surfaceCondition: null, walkability: null, overallAccessibility: null };
const state = ({ boxes = {}, extra = [], openId = null, scene = EMPTY_SCENE } = {}) => ({
  boxes: [
    suggestion(ids.lamp, boxes.lamp),
    suggestion(ids.tree, boxes.tree),
    suggestion(ids.car, boxes.car),
    suggestion(ids.moto, boxes.moto),
    ...extra,
  ],
  openId,
  scene,
});
const index = (key) => PRACTICE_STEPS.findIndex((s) => s.key === key);
const onPathYes = { onSidewalk: true, obstructs: undefined };
const confirmed = (severity) => ({ onSidewalk: true, obstructs: true, selected: true, severity });
const answeredNo = { onSidewalk: true, obstructs: false, isRejected: true };
const offPath = { onSidewalk: false, obstructs: false, isRejected: true };
const POST = { ...DRAW_TARGET, type: "RECT" };

describe("the practice's photo and boxes", () => {
  it("is the first tutorial photo, the one the home page's preview plays", () => {
    expect(DEMO_IMAGES[0]).toBe(PHOTO);
    expect(PHOTO.imageID).toBe("TUTORIAL-001");
  });

  it("has every box a step names, by the preview's ids", () => {
    const onPhoto = PHOTO.annotationList.map((b) => b.id);
    expect(PRACTICE_IDS).toBe(ids);
    for (const id of Object.values(PRACTICE_IDS)) expect(onPhoto).toContain(id);
    expect(PHOTO.annotationList.find((b) => b.id === PRACTICE_IDS.tree).comment).toBe("tree");
    expect(PHOTO.annotationList.find((b) => b.id === PRACTICE_IDS.car).comment).toBe("car");
    expect(PHOTO.annotationList.find((b) => b.id === PRACTICE_IDS.moto).comment).toBe("motorcycle");
    expect(PHOTO.annotationList.find((b) => b.id === PRACTICE_IDS.lamp).comment).toBe("lamp_post");
  });

  it("gives the tree the model's hint that step 3 shows", () => {
    expect(PHOTO.annotationList.find((b) => b.id === PRACTICE_IDS.tree).proposedObstructs).toBe(true);
  });

  it("has the white post's target inside the photo, and clear of every suggestion", () => {
    const { width, height } = DEMO_IMAGE_SIZE;
    expect(DRAW_TARGET).toEqual({ x: 428, y: 96, width: 22, height: 120 });
    expect(DRAW_TARGET.x).toBeGreaterThanOrEqual(0);
    expect(DRAW_TARGET.y).toBeGreaterThanOrEqual(0);
    expect(DRAW_TARGET.x + DRAW_TARGET.width).toBeLessThanOrEqual(width);
    expect(DRAW_TARGET.y + DRAW_TARGET.height).toBeLessThanOrEqual(height);
    for (const box of PHOTO.annotationList) expect(drawTargetIoU(box.mark), box.id).toBe(0);
  });

  it("has ten steps, each with a lock", () => {
    expect(PRACTICE_STEP_COUNT).toBe(10);
    expect(PRACTICE_STEPS.map((s) => s.key)).toEqual([
      "openTree", "treeOnPath", "treeObstructs", "treeSeverity", "carOff",
      "drawPost", "answerDrawn", "lastTwo", "scene", "next",
    ]);
    for (const step of PRACTICE_STEPS) expect(practiceLockFor(step), step.key).toBeTruthy();
  });
});

describe("practiceStepDone", () => {
  it("step 1: the tree's panel is open", () => {
    expect(practiceStepDone(0, state())).toBe(false);
    expect(practiceStepDone(0, state({ openId: ids.car }))).toBe(false);
    expect(practiceStepDone(0, state({ openId: ids.tree }))).toBe(true);
    expect(practiceStepDone(0, null)).toBe(false);
  });

  it("step 2: the tree is on the path", () => {
    expect(practiceStepDone("treeOnPath", state({ openId: ids.tree }))).toBe(false);
    expect(practiceStepDone("treeOnPath", state({ boxes: { tree: offPath } }))).toBe(false);
    expect(practiceStepDone("treeOnPath", state({ boxes: { tree: onPathYes } }))).toBe(true);
  });

  it("step 3: the tree answered whether it obstructs, by Yes or by No", () => {
    expect(practiceStepDone("treeObstructs", state({ boxes: { tree: onPathYes } }))).toBe(false);
    // A first Yes, the severity picker still open
    expect(practiceStepDone("treeObstructs", state({ boxes: { tree: { onSidewalk: true, obstructs: true, selected: true } } }))).toBe(true);
    expect(practiceStepDone("treeObstructs", state({ boxes: { tree: answeredNo } }))).toBe(true);
    // Off the path is not an answer to this question
    expect(practiceStepDone("treeObstructs", state({ boxes: { tree: offPath } }))).toBe(false);
  });

  it("step 4: the tree has a severity, any value, and is skipped after a No", () => {
    const yes = { onSidewalk: true, obstructs: true, selected: true };
    expect(practiceStepDone("treeSeverity", state({ boxes: { tree: yes } }))).toBe(false);
    for (const severity of [1, 2, 3, 4, 5]) {
      expect(practiceStepDone("treeSeverity", state({ boxes: { tree: confirmed(severity) } }))).toBe(true);
    }
    expect(practiceStepSkipped("treeSeverity", state({ boxes: { tree: answeredNo } }))).toBe(true);
    expect(practiceStepSkipped("treeSeverity", state({ boxes: { tree: yes } }))).toBe(false);
    // Step 3 answered No goes straight to step 5
    expect(nextPracticeStep(index("treeObstructs"), state({ boxes: { tree: answeredNo } }))).toBe(index("carOff"));
    expect(nextPracticeStep(index("treeObstructs"), state({ boxes: { tree: yes } }))).toBe(index("treeSeverity"));
    // Go back on the picker, then No: step 4 is done by the No
    expect(practiceStepDone("treeSeverity", state({ boxes: { tree: answeredNo } }))).toBe(true);
  });

  it("step 5: the car is off the path", () => {
    expect(practiceStepDone("carOff", state({ openId: ids.car }))).toBe(false);
    expect(practiceStepDone("carOff", state({ boxes: { car: onPathYes } }))).toBe(false);
    expect(practiceStepDone("carOff", state({ boxes: { car: offPath } }))).toBe(true);
  });

  it("step 6: a drawn box covers the white post with an IoU of at least 0.3", () => {
    expect(DRAW_MIN_IOU).toBe(0.3);
    expect(practiceStepDone("drawPost", state())).toBe(false);
    expect(practiceStepDone("drawPost", state({ extra: [drawn(POST)] }))).toBe(true);
    // Twice as wide as the post, the same height: IoU 0.5
    expect(practiceStepDone("drawPost", state({ extra: [drawn({ ...POST, x: 417, width: 44 })] }))).toBe(true);
    // A box drawn up and to the left, with a negative size, still counts
    expect(practiceStepDone("drawPost", state({ extra: [drawn({ x: 450, y: 216, width: -22, height: -120, type: "RECT" })] }))).toBe(true);
    // Somewhere else on the photo
    expect(practiceStepDone("drawPost", state({ extra: [drawn({ x: 560, y: 260, width: 40, height: 40, type: "RECT" })] }))).toBe(false);
    // A suggestion over the post would not count: only drawn boxes
    expect(practiceStepDone("drawPost", state({ extra: [{ ...drawn(POST), editable: false }] }))).toBe(false);
  });

  it("the IoU rule: 0.3 passes, a little under fails", () => {
    // The post's own box covers 2640 px². A box over its top 30% only: IoU 0.3.
    const top = { ...POST, height: 36 };
    expect(drawTargetIoU(top)).toBeCloseTo(0.3, 5);
    expect(practiceDrawnBox(state({ extra: [drawn(top)] }))).not.toBeNull();
    const less = { ...POST, height: 35 };
    expect(drawTargetIoU(less)).toBeLessThan(0.3);
    expect(practiceDrawnBox(state({ extra: [drawn(less)] }))).toBeNull();
    // Of two boxes, the one nearer the post
    const better = drawn(POST, { id: "drawn-2" });
    expect(practiceDrawnBox(state({ extra: [drawn(top), better] })).id).toBe("drawn-2");
  });

  it("step 7: the drawn box has a category, Question 1, and Question 2 with a severity if Yes", () => {
    const at = (extra) => state({ extra: [drawn(POST, extra)] });
    expect(practiceStepDone("answerDrawn", at({}))).toBe(false);
    expect(practiceStepDone("answerDrawn", at({ comment: "lamp_post" }))).toBe(false);
    expect(practiceStepDone("answerDrawn", at({ comment: "lamp_post", onSidewalk: true }))).toBe(false);
    expect(practiceStepDone("answerDrawn", at({ comment: "lamp_post", onSidewalk: true, obstructs: true }))).toBe(false);
    expect(practiceStepDone("answerDrawn", at({ comment: "lamp_post", onSidewalk: true, obstructs: true, severity: 4 }))).toBe(true);
    expect(practiceStepDone("answerDrawn", at({ comment: "lamp_post", onSidewalk: true, obstructs: false }))).toBe(true);
    expect(practiceStepDone("answerDrawn", at({ comment: "lamp_post", onSidewalk: false, obstructs: false }))).toBe(true);
    // Answers but no category
    expect(practiceStepDone("answerDrawn", at({ onSidewalk: false, obstructs: false }))).toBe(false);
  });

  it("step 7 gives way to step 6 when the drawn box is deleted or fitted away", () => {
    const at7 = index("answerDrawn");
    expect(practiceStepFor(at7, state({ extra: [drawn(POST)] }))).toBe(at7);
    expect(practiceStepFor(at7, state())).toBe(index("drawPost"));
    expect(practiceStepFor(index("lastTwo"), state())).toBe(index("lastTwo"));
  });

  it("step 8: the motorcycle and the lamp post answered, or marked Not an object", () => {
    expect(practiceStepDone("lastTwo", state())).toBe(false);
    expect(practiceStepDone("lastTwo", state({ boxes: { moto: answeredNo } }))).toBe(false);
    expect(practiceStepDone("lastTwo", state({ boxes: { moto: answeredNo, lamp: offPath } }))).toBe(true);
    expect(practiceStepDone("lastTwo", state({ boxes: { moto: confirmed(2), lamp: answeredNo } }))).toBe(true);
    // A Yes still waiting for its severity is not done
    expect(practiceStepDone("lastTwo", state({ boxes: { moto: { onSidewalk: true, obstructs: true, selected: true }, lamp: offPath } }))).toBe(false);
    const notAnObject = { comment: NOT_AN_OBJECT, isRejected: true, obstructs: false };
    expect(practiceStepDone("lastTwo", state({ boxes: { moto: notAnObject, lamp: notAnObject } }))).toBe(true);
    expect(practiceStepDone("lastTwo", state({ boxes: { moto: notAnObject, lamp: answeredNo } }))).toBe(true);
  });

  it("step 9: Step 2 complete, four answers or None", () => {
    expect(practiceStepDone("scene", state())).toBe(false);
    const three = { sidewalkWidth: "moderate", surfaceCondition: 3, walkability: 3, overallAccessibility: null };
    expect(practiceStepDone("scene", state({ scene: three }))).toBe(false);
    expect(practiceStepDone("scene", state({ scene: { ...three, overallAccessibility: 5 } }))).toBe(true);
    expect(practiceStepDone("scene", state({ scene: { ...EMPTY_SCENE, sidewalkWidth: "no_sidewalk" } }))).toBe(true);
  });

  it("step 10: done by going to image 2, never by the tool's state", () => {
    expect(practiceStepDone("next", state())).toBe(false);
    expect(nextPracticeStep(index("next"), state())).toBe(PRACTICE_STEP_COUNT);
  });

  it("the whole run, each step done in turn by the preview's answers", () => {
    const steps = [
      state({ openId: ids.tree }),
      state({ openId: ids.tree, boxes: { tree: onPathYes } }),
      state({ openId: ids.tree, boxes: { tree: { onSidewalk: true, obstructs: true, selected: true } } }),
      state({ boxes: { tree: confirmed(1) } }),
      state({ boxes: { tree: confirmed(1), car: offPath } }),
    ];
    steps.forEach((s, i) => expect(practiceStepDone(i, s), PRACTICE_STEPS[i].key).toBe(true));
    let i = 0;
    for (const s of steps) i = nextPracticeStep(i, s);
    expect(PRACTICE_STEPS[i].key).toBe("drawPost");
  });
});

describe("the locks", () => {
  it("opens only the tree for steps 1 to 4, and keeps its Question 1 at Yes", () => {
    for (const key of ["openTree", "treeOnPath", "treeObstructs", "treeSeverity"]) {
      const lock = practiceLockFor(key);
      expect(lock.openable, key).toEqual([ids.tree]);
      expect(lock.canDraw, key).toBe(false);
      expect(lock.canSubmit, key).toBe(false);
      expect(lock.allowAnswers, key).toEqual({ onSidewalk: true });
    }
  });

  it("directs only the two answers the photo settles: the tree on the path, the car off it", () => {
    const directed = PRACTICE_STEPS.map((s) => s.lock.allowAnswers).filter((a) => a && Object.keys(a).length > 0);
    for (const answers of directed) expect(Object.keys(answers)).toEqual(["onSidewalk"]);
    expect(practiceLockFor("carOff")).toMatchObject({ openable: [ids.car], canDraw: false, allowAnswers: { onSidewalk: false } });
    // Step 3 leaves Question 2 to the contributor
    expect(practiceLockFor("treeObstructs").allowAnswers.obstructs).toBeUndefined();
    for (const step of PRACTICE_STEPS) expect(step.lock.allowAnswers?.obstructs, step.key).toBeUndefined();
  });

  it("allows drawing from step 6 only, and Next Image at step 10 only", () => {
    PRACTICE_STEPS.forEach((step, i) => {
      expect(step.lock.canDraw, step.key).toBe(i >= index("drawPost"));
      expect(step.lock.canSubmit, step.key).toBe(i === index("next"));
    });
    expect(practiceLockFor("drawPost").openable).toEqual([]);
  });

  it("opens every box, and allows any answer, from step 8", () => {
    for (const key of ["lastTwo", "scene", "next"]) {
      expect(practiceLockFor(key).openable).toBe("all");
      expect(practiceLockFor(key).allowAnswers).toBeNull();
    }
  });
});

describe("practiceTargets", () => {
  const S = PRACTICE_SELECTORS;
  const yesPicker = { onSidewalk: true, obstructs: true, selected: true };

  it("lights the photo and outlines the tree until its panel is open", () => {
    expect(practiceTargets("openTree", state())).toMatchObject({ highlight: { boxId: ids.tree }, spotlight: [S.photo], rings: [] });
    expect(practiceTargets("treeOnPath", state()).highlight).toEqual({ boxId: ids.tree });
  });

  it("rings Question 1's Yes at step 2, with the open box marked and no outline on it", () => {
    const t = practiceTargets("treeOnPath", state({ openId: ids.tree }));
    expect(t).toMatchObject({ highlight: { avoidBoxIds: [ids.tree] }, rings: [S.onPathYes], spotlight: [S.photo] });
    expect(t.highlight.boxId).toBeUndefined();
  });

  it("lights the answers sheet and the open box on touch while a panel is the step", () => {
    const t = practiceTargets("treeOnPath", state({ openId: ids.tree }), "touch");
    expect(t.spotlight).toEqual([S.answerSheet, S.openBox]);
  });

  it("rings Yes and No at step 3, alike, and never the model's line (Rans, 8 Nov 2026)", () => {
    const t = practiceTargets("treeObstructs", state({ openId: ids.tree, boxes: { tree: onPathYes } }));
    expect(t.rings).toEqual([S.obstructsYes, S.obstructsNo]);
    expect(t.rings).not.toContain(S.modelHint);
    expect(t.spotlight).toEqual([S.photo]);
  });

  it("rings Confirm at step 4 and not the slider, and Yes and No again after Go back", () => {
    expect(practiceTargets("treeSeverity", state({ openId: ids.tree, boxes: { tree: yesPicker } })).rings).toEqual([S.confirm]);
    expect(practiceTargets("treeSeverity", state({ openId: ids.tree, boxes: { tree: onPathYes } })).rings).toEqual([S.obstructsYes, S.obstructsNo]);
  });

  it("dims nothing on touch for a step on the photo, and lights the sheet for a panel (Rans, 8 Nov 2026)", () => {
    for (const [key, st] of [["openTree", state()], ["carOff", state()], ["drawPost", state()], ["lastTwo", state()], ["treeOnPath", state()], ["answerDrawn", state({ extra: [drawn(POST)] })]]) {
      expect(practiceTargets(key, st, "touch").spotlight, key).toEqual([]);
      expect(practiceTargets(key, st).spotlight, key).toEqual([S.photo]);
    }
    expect(practiceTargets("carOff", state({ openId: ids.car }), "touch").spotlight).toEqual([S.answerSheet, S.openBox]);
  });

  it("at step 5 outlines the car, then rings its Question 1 No", () => {
    expect(practiceTargets("carOff", state()).highlight).toEqual({ boxId: ids.car });
    expect(practiceTargets("carOff", state({ openId: ids.car }))).toMatchObject({ highlight: { avoidBoxIds: [ids.car] }, rings: [S.onPathNo] });
  });

  it("at step 6 outlines the white post; on touch rings Add box with the card by it, then above the post once the new box is open", () => {
    expect(practiceTargets("drawPost", state())).toMatchObject({ highlight: { rect: DRAW_TARGET }, rings: [], spotlight: [S.photo], cardNear: null });
    expect(practiceTargets("drawPost", state(), "touch")).toMatchObject({ highlight: { rect: DRAW_TARGET }, rings: [S.addBox], spotlight: [], cardNear: S.addBox });
    // Add box tapped: the new box open, the card above the post and clear of the box
    expect(practiceTargets("drawPost", state({ openId: "drawn-1" }), "touch")).toMatchObject({
      highlight: { rect: DRAW_TARGET, avoidBoxIds: ["drawn-1"] }, rings: [S.addBox], spotlight: [], cardNear: S.drawTarget,
    });
    expect(S.drawTarget).toBe("[data-practice-highlight='rect']");
    for (const step of PRACTICE_STEPS) {
      if (step.key !== "drawPost") expect(practiceTargets(step, state(), "touch").cardNear, step.key).toBeNull();
    }
  });

  it("at step 7 rings the category field, then Confirm for a Yes", () => {
    const box = drawn(POST);
    expect(practiceTargets("answerDrawn", state({ extra: [box], openId: box.id })).rings).toEqual([S.category]);
    expect(practiceTargets("answerDrawn", state({ extra: [box] })).highlight).toEqual({ boxId: box.id });
    expect(practiceTargets("answerDrawn", state({ extra: [{ ...box, comment: "lamp_post" }], openId: box.id })).rings).toEqual([]);
    expect(practiceTargets("answerDrawn", state({ extra: [{ ...box, comment: "lamp_post", onSidewalk: true, obstructs: true }], openId: box.id })).rings).toEqual([S.confirm]);
  });

  it("at step 8 outlines the two boxes still to answer", () => {
    expect(practiceTargets("lastTwo", state()).highlight).toEqual({ boxIds: [ids.moto, ids.lamp] });
    expect(practiceTargets("lastTwo", state({ boxes: { moto: answeredNo } })).highlight).toEqual({ boxIds: [ids.lamp] });
    expect(practiceTargets("lastTwo", state({ openId: ids.moto })).highlight).toEqual({ boxIds: [ids.lamp], avoidBoxIds: [ids.moto] });
  });

  it("at step 9 lights Step 2's questions one at a time, and on touch its line until the sheet is up", () => {
    const at = (scene, words) => practiceTargets("scene", state({ scene: { ...EMPTY_SCENE, ...scene } }), words);
    expect(SCENE_QUESTIONS).toEqual(["sidewalkWidth", "surfaceCondition", "walkability", "overallAccessibility"]);
    expect(at({}).spotlight).toEqual(["[data-scene-question='sidewalkWidth']"]);
    expect(at({ sidewalkWidth: "moderate" }).spotlight).toEqual(["[data-scene-question='surfaceCondition']"]);
    expect(at({ sidewalkWidth: "moderate", surfaceCondition: 3, walkability: 3 }).spotlight).toEqual(["[data-scene-question='overallAccessibility']"]);
    expect(at({}).rings).toEqual([]);
    expect(at({}).fallback).toBeNull();
    expect(at({}, "touch").fallback).toEqual({ unless: S.sheetUp, rings: [S.sceneLine], spotlight: [S.sceneLine] });
  });

  it("at step 10 lights and rings Next Image", () => {
    expect(practiceTargets("next", state())).toMatchObject({ rings: ["button[type='submit']"], spotlight: ["button[type='submit']"] });
  });

  it("keeps the card off the box panel on a laptop, and off the top bar on touch", () => {
    expect(practiceTargets("treeOnPath", state()).avoid).toEqual([S.floatingPanel]);
    expect(practiceTargets("treeOnPath", state(), "touch").avoid).toEqual([S.topBar]);
  });

  it("rings only Question 1's Yes, Question 2's Yes and No, Confirm, No, Add box, the category and Next Image anywhere", () => {
    const allowed = new Set([S.onPathYes, S.obstructsYes, S.obstructsNo, S.confirm, S.onPathNo, S.addBox, S.category, S.submit, S.sceneLine]);
    const states = [
      state(), state({ openId: ids.tree }), state({ openId: ids.tree, boxes: { tree: onPathYes } }),
      state({ openId: ids.tree, boxes: { tree: yesPicker } }), state({ openId: ids.car }),
    ];
    for (const step of PRACTICE_STEPS) {
      for (const words of ["pointer", "touch"]) {
        for (const st of states) {
          const t = practiceTargets(step, st, words);
          for (const ring of [...t.rings, ...(t.fallback?.rings ?? [])]) expect(allowed.has(ring), `${step.key} ${ring}`).toBe(true);
          expect(t.rings, step.key).not.toContain(S.modelHint);
          expect(t.rings, step.key).not.toContain(S.severity);
        }
      }
    }
  });
});

describe("boxAnswered", () => {
  it("counts off the path, a No, a Yes with a severity and Not an object", () => {
    expect(boxAnswered(null)).toBe(false);
    expect(boxAnswered(suggestion(ids.moto))).toBe(false);
    expect(boxAnswered(suggestion(ids.moto, offPath))).toBe(true);
    expect(boxAnswered(suggestion(ids.moto, answeredNo))).toBe(true);
    expect(boxAnswered(suggestion(ids.moto, confirmed(3)))).toBe(true);
    expect(boxAnswered(suggestion(ids.moto, { comment: NOT_AN_OBJECT }))).toBe(true);
  });
});
