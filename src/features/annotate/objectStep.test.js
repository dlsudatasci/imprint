import { describe, it, expect } from "vitest";
import { summarizeObjectStep, findNearDuplicates } from "./objectStep.js";

const mark = (x, y, width, height) => ({ type: "RECT", x, y, width, height });

describe("summarizeObjectStep", () => {
  const boxes = [
    { id: "s3", editable: false, selected: false, comment: "tree", mark: mark(0, 0, 10, 10) },
    { id: "s1", editable: false, selected: true, comment: "car", mark: mark(0, 0, 10, 10) },
    { id: "s2", editable: false, selected: false, isRejected: true, comment: "not_an_object", mark: mark(0, 0, 10, 10) },
    { id: "s4", editable: false, selected: false, isRejected: true, comment: "bench", mark: mark(0, 0, 10, 10) },
    { id: "s0", editable: false, selected: true, comment: "truck", mark: mark(0, 0, 10, 10) },
    { id: "d1", editable: true, selected: false, comment: "---", mark: mark(0, 0, 10, 10) },
    { id: "d2", editable: true, selected: false, comment: "bollard", mark: mark(0, 0, 10, 10) },
  ];

  it("counts suggestions, decisions, kept, Not an object, drawn and unlabeled boxes", () => {
    expect(summarizeObjectStep(boxes)).toMatchObject({
      suggestions: 5,
      decided: 3,
      kept: 2,
      notAnObject: 1,
      drawn: 2,
      unlabeled: 2, // the kept "truck" and the drawn "---"
    });
  });

  it("lists undecided suggestions in id order, including an old No answer", () => {
    expect(summarizeObjectStep(boxes).toDecideIds).toEqual(["s3", "s4"]);
  });

  it("handles an image with no boxes", () => {
    expect(summarizeObjectStep([])).toEqual({
      suggestions: 0, decided: 0, kept: 0, notAnObject: 0, drawn: 0, unlabeled: 0, toDecideIds: [],
    });
  });
});

describe("findNearDuplicates", () => {
  it("reports a drawn box over a kept suggestion at IoU 0.9", () => {
    const kept = { id: "s1", editable: false, selected: true, comment: "car", mark: mark(0, 0, 100, 100) };
    const drawn = { id: "d1", editable: true, comment: "car", mark: mark(0, 0, 100, 90) };
    const pairs = findNearDuplicates([kept, drawn]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].iou).toBeCloseTo(0.9);
    expect([pairs[0].a.id, pairs[0].b.id]).toEqual(["d1", "s1"]);
  });

  it("does not report two neighbouring trees at IoU 0.3", () => {
    const a = { id: "d1", editable: true, comment: "tree", mark: mark(0, 0, 100, 100) };
    const b = { id: "d2", editable: true, comment: "tree", mark: mark(54, 0, 100, 100) };
    expect(findNearDuplicates([a, b])).toEqual([]);
  });

  it("ignores Not an object boxes and undecided suggestions", () => {
    const nao = { id: "s1", editable: false, selected: false, isRejected: true, comment: "not_an_object", mark: mark(0, 0, 100, 100) };
    const undecided = { id: "s2", editable: false, selected: false, comment: "car", mark: mark(0, 0, 100, 100) };
    const drawn = { id: "d1", editable: true, comment: "car", mark: mark(0, 0, 100, 100) };
    expect(findNearDuplicates([nao, undecided, drawn])).toEqual([]);
  });

  it("normalizes negative-size marks before comparing", () => {
    const kept = { id: "s1", editable: false, selected: true, comment: "car", mark: mark(0, 0, 100, 100) };
    const drawnUpLeft = { id: "d1", editable: true, comment: "car", mark: mark(100, 100, -100, -100) };
    expect(findNearDuplicates([kept, drawnUpLeft])).toHaveLength(1);
  });
});
