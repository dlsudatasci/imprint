import { describe, it, expect } from "vitest";
import {
  buildReferenceStandard,
  computePRF1,
  computeReferencePerformanceAgainstTeam,
  inTaskObjects,
  mostlyObstructs,
  scoreAgainstStandard,
} from "./qualityMetrics";

/*
 * S21 (8 Nov 2026, pipeline_methodology.md 7x): a contributor's recall on a
 * reference image counts only the answer-key objects within their task, those
 * overlapping a suggestion they were shown (by the model's own box,
 * initialState.mark) and those most of their annotators said obstruct.
 * Precision is unchanged.
 */

const mark = (x, w = 100) => ({ x, y: 0, width: w, height: 100 });
const obj = (x, comment, extra = {}) => ({ mark: mark(x), comment, obstructs: false, ...extra });
const team = (...rows) => rows.map((boxes) => ({ selectedObjectsID: [], newObjects: boxes }));
/** A suggestion shown at the model's box `at`, answered as `answer` (the contributor's saved box). */
const suggestion = (at, modelCategory, answer = {}) => ({
  mark: mark(at),
  comment: modelCategory,
  obstructs: false,
  ...answer,
  initialState: { comment: modelCategory, mark: mark(at) },
});
const contributor = (selectedObjectsID = [], newObjects = []) => ({ selectedObjectsID, newObjects });

// Every annotator boxed a tree at 0, a car at 300 and a bench far down the road at 900. No one said any obstructs.
const threeObjects = () =>
  buildReferenceStandard(team(
    [obj(0, "tree"), obj(300, "car"), obj(900, "bench")],
    [obj(0, "tree"), obj(300, "car"), obj(900, "bench")],
    [obj(0, "tree"), obj(300, "car"), obj(900, "bench")],
  ));

describe("buildReferenceStandard obstructsYes (S21)", () => {
  it("counts the members who said the object obstructs, false, null and missing not counted", () => {
    const std = buildReferenceStandard(team(
      [obj(0, "tree", { obstructs: true })],
      [obj(0, "tree", { obstructs: false })],
      [obj(0, "tree", { obstructs: null })],
      [{ mark: mark(0), comment: "tree" }],
    ));
    expect(std.objects).toHaveLength(1);
    expect(std.objects[0]).toMatchObject({ votes: 4, obstructsYes: 1 });
  });

  it("changes nothing else in the merge", () => {
    const std = threeObjects();
    expect(std.objects.map(({ mark: m, comment, votes }) => ({ m, comment, votes }))).toEqual([
      { m: mark(0), comment: "tree", votes: 3 },
      { m: mark(300), comment: "car", votes: 3 },
      { m: mark(900), comment: "bench", votes: 3 },
    ]);
    expect(std.objects.every((o) => o.obstructsYes === 0)).toBe(true);
    expect(std).toMatchObject({ annotatorCount: 3, uncertain: [], ties: 0, belowMinimumSize: 0 });
  });
});

describe("an object out of the task", () => {
  it("does not lower the recall of a contributor who leaves a far-away object alone", () => {
    const std = threeObjects();
    // Shown the tree and the car, answered both. The bench was never suggested.
    const c = contributor([suggestion(0, "tree"), suggestion(300, "car")]);
    const r = scoreAgainstStandard(c, std);
    expect(r).toMatchObject({
      precision: 1, recall: 1, f1: 1,
      truePositives: 2, falsePositives: 0, falseNegatives: 0,
      inTaskObjects: 2, inTaskBySuggestion: 2, inTaskByObstruction: 0, outOfTaskObjects: 1,
    });
    // The old rule divided by every answer-key object
    expect(computePRF1(2, 2, std.objects.length).recall).toBeLessThan(1);
  });

  it("counts a box matching an out-of-task object for precision without changing recall", () => {
    const std = threeObjects();
    const answered = [suggestion(0, "tree"), suggestion(300, "car", { comment: "tree" })]; // the car called a tree
    const without = scoreAgainstStandard(contributor(answered), std);
    const withBench = scoreAgainstStandard(contributor(answered, [obj(900, "bench")]), std);
    expect(without).toMatchObject({ truePositives: 1, falsePositives: 1, precision: 0.5, recall: 0.5 });
    expect(withBench).toMatchObject({
      truePositives: 2, falsePositives: 1, falseNegatives: 1, truePositivesOutOfTask: 1, recall: 0.5,
    });
    expect(withBench.precision).toBe(0.6667);
    // F1 from these precision and recall, which computePRF1(tp, predictions, total) cannot give
    expect(withBench.f1).toBe(0.5714);
    expect(computePRF1(2, 3, 2).f1).not.toBe(0.5714);
  });
});

describe("(a) objects overlapping a suggestion the contributor was shown", () => {
  it("reads the model's own box, not the box the contributor moved", () => {
    const std = threeObjects();
    const dragged = suggestion(0, "tree", { mark: mark(500) }); // shown on the tree, dragged away
    const r = scoreAgainstStandard(contributor([dragged]), std);
    expect(inTaskObjects(std, contributor([dragged])).objects[0]).toEqual({
      inTask: true, bySuggestion: true, byObstruction: false,
    });
    expect(r).toMatchObject({ inTaskObjects: 1, truePositives: 0, falseNegatives: 1, recall: 0 });

    // Shown away from the car and dragged onto it: the car was not suggested
    const ontoCar = { ...suggestion(600, "car"), mark: mark(300) };
    expect(inTaskObjects(std, contributor([ontoCar])).objects[1].bySuggestion).toBe(false);
  });

  it("puts the object in the task whatever the contributor answered", () => {
    const std = threeObjects();
    const answers = {
      notAnObject: { comment: "not_an_object", selected: false, isRejected: true, obstructs: false, severity: null },
      offPath: { onSidewalk: false, obstructs: false, severity: null },
      recategorized: { comment: "bench" },
    };
    for (const answer of Object.values(answers)) {
      const task = inTaskObjects(std, contributor([suggestion(0, "tree", answer)]));
      expect(task.objects[0]).toMatchObject({ inTask: true, bySuggestion: true });
    }

    // Not an object and a wrong category leave the tree unmatched
    for (const answer of [answers.notAnObject, answers.recategorized]) {
      const r = scoreAgainstStandard(contributor([suggestion(0, "tree", answer)]), std);
      expect(r).toMatchObject({ inTaskObjects: 1, truePositives: 0, falseNegatives: 1, recall: 0, f1: 0 });
    }
    // Not on the path with the right category is still a box the contributor kept
    const r = scoreAgainstStandard(contributor([suggestion(0, "tree", answers.offPath)]), std);
    expect(r).toMatchObject({ inTaskObjects: 1, truePositives: 1, falseNegatives: 0, recall: 1, precision: 1 });
  });

  it("counts a suggestion of any category", () => {
    const std = buildReferenceStandard(team([obj(0, "motorcycle")], [obj(0, "motorcycle")], [obj(0, "motorcycle")]));
    const c = contributor([suggestion(0, "car")]); // the model said car, the contributor kept car
    expect(inTaskObjects(std, c).objects).toEqual([{ inTask: true, bySuggestion: true, byObstruction: false }]);
    expect(scoreAgainstStandard(c, std)).toMatchObject({ inTaskObjects: 1, falseNegatives: 1, recall: 0 });
  });

  it("needs an IoU of at least 0.5 with the suggestion", () => {
    const std = threeObjects();
    // 100 wide boxes: shifted by 33 the IoU is 67/133, just above 0.5, by 34 it is 66/134, just under
    expect(inTaskObjects(std, contributor([suggestion(33, "tree")])).objects[0].bySuggestion).toBe(true);
    expect(inTaskObjects(std, contributor([suggestion(34, "tree")])).objects[0].bySuggestion).toBe(false);
  });

  it("uses a suggestion's own box when it was saved without initialState (before S5) and counts it", () => {
    const std = threeObjects();
    const old = { mark: mark(0), comment: "tree", obstructs: false }; // no initialState
    const noMark = { ...suggestion(300, "car"), initialState: { comment: "car", mark: null } };
    const task = inTaskObjects(std, contributor([old, noMark]));
    expect(task.suggestionsWithoutInitialState).toBe(2);
    expect(task.objects.map((t) => t.inTask)).toEqual([true, true, false]);
    expect(scoreAgainstStandard(contributor([old, noMark]), std)).toMatchObject({
      suggestionsWithoutInitialState: 2, inTaskObjects: 2, recall: 1,
    });
    expect(scoreAgainstStandard(contributor([suggestion(0, "tree")]), std).suggestionsWithoutInitialState).toBe(0);
  });
});

describe("(b) objects most of their annotators said obstruct", () => {
  const keyWith = (...answers) =>
    buildReferenceStandard(team(...answers.map((a) => [a === "missing" ? { mark: mark(0), comment: "tree" } : obj(0, "tree", { obstructs: a })])));
  const inTaskWith = (...answers) => inTaskObjects(keyWith(...answers), contributor()).objects[0];

  it("is in the task when more than half of its members said yes", () => {
    expect(inTaskWith(true, true, false)).toEqual({ inTask: true, bySuggestion: false, byObstruction: true });
    expect(inTaskWith(true, false, false).inTask).toBe(false);
    expect(inTaskWith(true, false).inTask).toBe(false); // half is not more than half
    expect(inTaskWith(true, true).inTask).toBe(true);
  });

  it("counts null and missing answers as not yes while keeping them in the total", () => {
    expect(inTaskWith(true, null, null).inTask).toBe(false);
    expect(inTaskWith(true, "missing", "missing").inTask).toBe(false);
    expect(inTaskWith(true, true, null).inTask).toBe(true);
    expect(inTaskWith(true, true, null, false).inTask).toBe(false);
    expect(mostlyObstructs({ votes: 3, obstructsYes: 2 })).toBe(true);
    expect(mostlyObstructs({ votes: 4, obstructsYes: 2 })).toBe(false);
  });

  it("ignores obstructsAsAnnotated", () => {
    const key = keyWith(...[0, 1, 2].map(() => false));
    key.objects[0].obstructsAsAnnotated = 3;
    expect(inTaskObjects(key, contributor()).objects[0].inTask).toBe(false);
    const fromStored = buildReferenceStandard(team(
      ...[0, 1, 2].map(() => [obj(0, "tree", { obstructs: false, obstructsAsAnnotated: true })]),
    ));
    expect(fromStored.objects[0].obstructsYes).toBe(0);
  });

  it("counts an object meeting both conditions in both", () => {
    const std = buildReferenceStandard(team(
      ...[0, 1, 2].map(() => [obj(0, "tree", { obstructs: true }), obj(300, "car", { obstructs: true })]),
    ));
    const r = scoreAgainstStandard(contributor([suggestion(0, "tree")]), std);
    expect(r).toMatchObject({
      inTaskObjects: 2, inTaskBySuggestion: 1, inTaskByObstruction: 2, outOfTaskObjects: 0,
      truePositives: 1, falseNegatives: 1, recall: 0.5,
    });
  });
});

describe("an image with no objects in the task", () => {
  const farBench = () => buildReferenceStandard(team([obj(900, "bench")], [obj(900, "bench")], [obj(900, "bench")]));

  it("gives recall and F1 null and still computes precision from the contributor's boxes", () => {
    expect(scoreAgainstStandard(contributor([], [obj(400, "tree")]), farBench())).toMatchObject({
      precision: 0, recall: null, f1: null, inTaskObjects: 0, outOfTaskObjects: 1, falseNegatives: 0,
    });
    expect(scoreAgainstStandard(contributor([], [obj(900, "bench")]), farBench())).toMatchObject({
      precision: 1, recall: null, f1: null, truePositivesOutOfTask: 1,
    });
  });

  it("gives all three null when the contributor has no boxes either", () => {
    expect(scoreAgainstStandard(contributor(), farBench())).toMatchObject({ precision: null, recall: null, f1: null });
  });
});

describe("computeReferencePerformanceAgainstTeam (S21)", () => {
  it("passes the in-task counts through and leaves obstruction agreement as it was", () => {
    const annotators = team(
      [obj(0, "tree", { obstructs: true }), obj(900, "bench")],
      [obj(0, "tree", { obstructs: true }), obj(900, "bench")],
    );
    const c = contributor([], [obj(0, "tree", { obstructs: true })]); // drew the tree, never shown it
    const r = computeReferencePerformanceAgainstTeam(c, annotators);
    expect(r).toMatchObject({
      recall: 1, precision: 1, f1: 1, inTaskObjects: 1, inTaskByObstruction: 1, outOfTaskObjects: 1,
      answerKeyObjects: 2, obstructionAgreement: 1,
    });
  });
});
