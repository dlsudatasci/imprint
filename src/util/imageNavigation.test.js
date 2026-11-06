// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { GO_TO_IMAGE_EVENT, requestImage, answerSignature, leaveAction, FINISH_BEFORE_LEAVING } from "./imageNavigation";

// 6 Nov 2026: moving between a session's images without losing an answer
const mark = (x) => ({ x, y: 10, width: 20, height: 30, type: "RECT" });
const no = (id) => ({ id, comment: "car", mark: mark(1), editable: false, selected: false, isRejected: true, onSidewalk: true, obstructs: false });

describe("requestImage", () => {
  it("sends the image asked for as the window event's detail", () => {
    const heard = vi.fn();
    window.addEventListener(GO_TO_IMAGE_EVENT, heard);
    requestImage(3);
    window.removeEventListener(GO_TO_IMAGE_EVENT, heard);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard.mock.calls[0][0].detail).toBe(3);
  });
});

describe("answerSignature", () => {
  const boxes = [no("a"), { ...no("b"), comment: "tree" }];

  it("is the same for the same answers in any order", () => {
    expect(answerSignature({ boxes })).toBe(answerSignature({ boxes: [...boxes].reverse() }));
  });

  it("leaves out suggestions not answered, and fields that are not answers", () => {
    const unanswered = { id: "c", comment: "bench", mark: mark(5), editable: false, selected: false, isRejected: false };
    expect(answerSignature({ boxes: [...boxes, unanswered] })).toBe(answerSignature({ boxes }));
    expect(answerSignature({ boxes: boxes.map((b) => ({ ...b, confidence: 0.4, initialState: { comment: "x" }, drawnOrder: 2 })) })).toBe(answerSignature({ boxes }));
  });

  it("changes with any answer, category, box, drawn box, Step 2 answer or outline", () => {
    const base = answerSignature({ boxes, scene: { sidewalkWidth: "one_person" }, mask: null });
    const variants = [
      { boxes: [{ ...no("a"), obstructs: true, severity: 2, selected: true, isRejected: false }, boxes[1]] },
      { boxes: [{ ...no("a"), onSidewalk: false }, boxes[1]] },
      { boxes: [{ ...no("a"), comment: "bollard" }, boxes[1]] },
      { boxes: [{ ...no("a"), mark: mark(9) }, boxes[1]] },
      { boxes: [...boxes, { id: "d1", comment: "bench", mark: mark(3), editable: true, onSidewalk: true, obstructs: false }] },
      { boxes, scene: { sidewalkWidth: "two_people" } },
      { boxes, scene: { sidewalkWidth: "one_person" }, mask: { noSidewalk: true, polygons: [] } },
    ];
    for (const v of variants) expect(answerSignature({ scene: { sidewalkWidth: "one_person" }, ...v })).not.toBe(base);
  });

  it("does not change for a box moved by a fraction of a pixel", () => {
    expect(answerSignature({ boxes: [{ ...no("a"), mark: { ...mark(1), x: 1.0001 } }] })).toBe(answerSignature({ boxes: [no("a")] }));
  });
});

describe("leaveAction", () => {
  const base = { current: 2, reached: 4, total: 5, changed: false };

  it("goes back or forward up to the furthest image reached when nothing changed", () => {
    for (const target of [1, 3, 4]) expect(leaveAction({ ...base, target })).toBe("go");
  });

  it("stays for the image on screen, past the furthest, outside the session or not a number", () => {
    for (const target of [2, 5, 6, 0, -1, 2.5, undefined, "3"]) expect(leaveAction({ ...base, target })).toBe("stay");
  });

  it("sends a sent image that changed first, or asks an annotator to finish it", () => {
    expect(leaveAction({ ...base, target: 1, changed: true })).toBe("send");
    expect(leaveAction({ ...base, target: 4, changed: true })).toBe("send");
    expect(leaveAction({ ...base, target: 4, changed: true, isAnnotator: true })).toBe("finish");
  });

  it("goes from the furthest image, never sent, with its changes kept in the browser", () => {
    expect(leaveAction({ current: 4, reached: 4, total: 5, changed: true, target: 1 })).toBe("go");
  });

  it("treats no furthest image as the image on screen", () => {
    expect(leaveAction({ current: 2, target: 3, total: 5, changed: false })).toBe("stay");
    expect(leaveAction({ current: 2, target: 1, total: 5, changed: true })).toBe("go");
  });
});

describe("FINISH_BEFORE_LEAVING", () => {
  it("has no em dash or semicolon", () => {
    expect(FINISH_BEFORE_LEAVING).not.toMatch(/[—;]/);
  });
});
