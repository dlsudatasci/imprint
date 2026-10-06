import { describe, it, expect } from "vitest";
import {
  isRealObject,
  realObjects,
  summarizeObstructionStep,
  toggleObstructionPatch,
  finalizeObstructionAnswers,
  pickJudgeTarget,
} from "./obstructionStep.js";

const rect = (x, y, width, height) => ({ type: "RECT", x, y, width, height });
const kept = (id, extra = {}) => ({ id, editable: false, selected: true, comment: "tree", mark: rect(0, 0, 100, 100), ...extra });
const drawn = (id, extra = {}) => ({ id, editable: true, selected: false, comment: "car", mark: rect(0, 0, 100, 100), ...extra });
const notAnObject = (id, extra = {}) => ({ id, editable: false, selected: false, isRejected: true, comment: "not_an_object", obstructs: null, mark: rect(0, 0, 100, 100), ...extra });
const undecided = (id) => ({ id, editable: false, selected: false, comment: "bench", mark: rect(0, 0, 100, 100) });

describe("isRealObject and realObjects", () => {
  it("counts drawn boxes and kept suggestions, not Not an object boxes or undecided suggestions", () => {
    expect(isRealObject(drawn("d1"))).toBe(true);
    expect(isRealObject(kept("s1"))).toBe(true);
    expect(isRealObject(notAnObject("s2"))).toBe(false);
    expect(isRealObject(undecided("s3"))).toBe(false);
    expect(isRealObject(undefined)).toBe(false);
  });

  it("lists the real objects sorted by id", () => {
    const boxes = [kept("s9"), notAnObject("s1"), drawn("d2"), undecided("s5"), kept("s3")];
    expect(realObjects(boxes).map((b) => b.id)).toEqual(["d2", "s3", "s9"]);
    expect(realObjects(undefined)).toEqual([]);
  });
});

describe("toggleObstructionPatch", () => {
  it("cycles not answered, obstructing, not answered, and always clears severity", () => {
    const box = kept("s1", { severity: 4 });
    const first = toggleObstructionPatch(box);
    expect(first).toEqual({ obstructs: true, severity: null });
    const second = toggleObstructionPatch({ ...box, ...first });
    expect(second).toEqual({ obstructs: null, severity: null });
    expect(toggleObstructionPatch({ ...box, obstructs: false })).toEqual({ obstructs: true, severity: null });
  });
});

describe("summarizeObstructionStep", () => {
  it("counts real objects and the ones marked as obstructing", () => {
    const boxes = [kept("s1", { obstructs: true }), drawn("d1"), notAnObject("s2", { obstructs: true }), kept("s3", { obstructs: false })];
    expect(summarizeObstructionStep(boxes)).toEqual({ objects: 3, marked: 1 });
  });
});

describe("finalizeObstructionAnswers", () => {
  it("turns marks into true, every other real object into false, and Not an object into null", () => {
    const boxes = [
      kept("s1", { obstructs: true, severity: 3 }),
      kept("s2", { obstructs: null }),
      drawn("d1"),
      drawn("d2", { obstructs: false }),
      notAnObject("s3", { obstructs: false }),
    ];
    const out = finalizeObstructionAnswers(boxes);
    expect(out.map((b) => b.obstructs)).toEqual([true, false, false, false, null]);
    for (const b of out) expect(b.severity).toBeNull();
  });

  it("does not mutate its input", () => {
    const boxes = [kept("s1", { obstructs: true, severity: 3 }), drawn("d1")];
    const snapshot = structuredClone(boxes);
    const out = finalizeObstructionAnswers(boxes);
    expect(boxes).toEqual(snapshot);
    expect(out[0]).not.toBe(boxes[0]);
  });
});

describe("pickJudgeTarget", () => {
  it("returns the real object under the point", () => {
    expect(pickJudgeTarget([kept("s1")], 50, 50).id).toBe("s1");
  });

  it("picks the smaller of two nested boxes", () => {
    const outer = kept("s1", { mark: rect(0, 0, 300, 300) });
    const inner = drawn("d1", { mark: rect(100, 100, 50, 50) });
    expect(pickJudgeTarget([outer, inner], 120, 120).id).toBe("d1");
    expect(pickJudgeTarget([inner, outer], 120, 120).id).toBe("d1");
    expect(pickJudgeTarget([outer, inner], 20, 20).id).toBe("s1");
  });

  it("hits a box stored with a negative size", () => {
    const flipped = drawn("d1", { mark: rect(200, 200, -100, -100) });
    expect(pickJudgeTarget([flipped], 150, 150).id).toBe("d1");
  });

  it("ignores Not an object boxes and undecided suggestions", () => {
    expect(pickJudgeTarget([notAnObject("s1"), undecided("s2")], 50, 50)).toBeNull();
  });

  it("returns null on an empty point", () => {
    expect(pickJudgeTarget([kept("s1")], 500, 500)).toBeNull();
    expect(pickJudgeTarget([], 0, 0)).toBeNull();
  });
});
