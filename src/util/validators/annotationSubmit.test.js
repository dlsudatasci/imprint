import { describe, it, expect } from "vitest";
import {
  MAX_BOXES_PER_IMAGE,
  SIDEWALK_WIDTH_OPTIONS,
  validateSceneLevel,
  validateBoxes,
  normalizeAnnotatorSubmission,
  validateAnnotatorBoxes,
  normalizeSubmittedMarks,
  hasEmptyBox,
  applyRecordSuggestions,
  clearDrawnModelFields,
  withRecordConfidences,
  isPresenceAnswer,
  RELOAD_FOR_NEW_QUESTIONS,
  PATH_HAS_NO_SIDEWALK_ANSWER,
} from "./annotationSubmit.js";
import { SCENE_KEYS, SIDEWALK_ONLY_KEYS, SURFACE_TYPE_OPTIONS, SIDEWALK_WIDTH_OPTIONS as SHARED_WIDTHS } from "./sceneQuestions.mjs";

// Step 3 (S15, 9 Nov 2026): six questions for a sidewalk, two for a path
describe("validateSceneLevel", () => {
  const validScene = {
    sidewalkWidth: "two_people",
    overallAccessibility: 3,
    surfaceEvenness: 2,
    surfaceType: "concrete",
    surfaceCondition: 2,
    roadBarrier: false,
  };
  const pathScene = { sidewalkWidth: null, overallAccessibility: 4, surfaceEvenness: 1, surfaceType: null, surfaceCondition: null, roadBarrier: null };

  it("accepts a sidewalk's six answers and returns them as stored", () => {
    expect(validateSceneLevel(validScene, true)).toEqual({ valid: true, sceneLevel: validScene });
  });

  it("accepts a path's two answers, the four sidewalk-only ones null or absent, and stores all six keys", () => {
    expect(validateSceneLevel(pathScene, false)).toEqual({ valid: true, sceneLevel: pathScene });
    const result = validateSceneLevel({ overallAccessibility: 4, surfaceEvenness: 1 }, false);
    expect(result).toEqual({ valid: true, sceneLevel: pathScene });
    expect(Object.keys(result.sceneLevel)).toEqual([...SCENE_KEYS]);
  });

  it("refuses a sidewalk-only answer on a path", () => {
    for (const key of SIDEWALK_ONLY_KEYS) {
      const result = validateSceneLevel({ ...pathScene, [key]: validScene[key] }, false);
      expect(result.valid).toBe(false);
      expect(result.message).toContain(key);
    }
    // roadBarrier false is an answer, so it is refused too
    expect(validateSceneLevel({ ...pathScene, roadBarrier: false }, false).valid).toBe(false);
  });

  it("refuses a missing key, for a sidewalk and for a path", () => {
    for (const key of SCENE_KEYS) {
      expect(validateSceneLevel({ ...validScene, [key]: null }, true).valid).toBe(false);
      const { [key]: _dropped, ...without } = validScene;
      void _dropped;
      expect(validateSceneLevel(without, true).valid).toBe(false);
    }
    expect(validateSceneLevel({ ...pathScene, overallAccessibility: null }, false).valid).toBe(false);
    expect(validateSceneLevel({ ...pathScene, surfaceEvenness: undefined }, false).valid).toBe(false);
  });

  it("refuses walkability and any other key that is not one of the six", () => {
    expect(validateSceneLevel({ ...validScene, walkability: 2 }, true)).toEqual({ valid: false, message: "sceneLevel.walkability is not a question." });
    expect(validateSceneLevel({ ...validScene, walkability: null }, true).valid).toBe(false);
    expect(validateSceneLevel({ ...pathScene, extra: 1 }, false).valid).toBe(false);
  });

  it("refuses no_sidewalk, which is Step 1's to say now", () => {
    expect(validateSceneLevel({ ...validScene, sidewalkWidth: "no_sidewalk" }, true).valid).toBe(false);
    expect(validateSceneLevel({ ...pathScene, sidewalkWidth: "no_sidewalk" }, false).valid).toBe(false);
  });

  it("refuses a string roadBarrier and an unknown surfaceType", () => {
    expect(validateSceneLevel({ ...validScene, roadBarrier: "true" }, true)).toEqual({ valid: false, message: "sceneLevel.roadBarrier must be true or false." });
    expect(validateSceneLevel({ ...validScene, roadBarrier: 1 }, true).valid).toBe(false);
    expect(validateSceneLevel({ ...validScene, surfaceType: "gravel" }, true)).toEqual({ valid: false, message: "sceneLevel.surfaceType must be concrete, tiles, pavers or unpaved." });
    for (const type of SURFACE_TYPE_OPTIONS) expect(validateSceneLevel({ ...validScene, surfaceType: type }, true).valid).toBe(true);
    expect(validateSceneLevel({ ...validScene, roadBarrier: true }, true).valid).toBe(true);
  });

  it("accepts each width and refuses any other", () => {
    for (const width of ["one_person", "two_people", "three_or_more"]) expect(validateSceneLevel({ ...validScene, sidewalkWidth: width }, true).valid).toBe(true);
    for (const width of ["maybe", "yes", "no", "partial", ""]) expect(validateSceneLevel({ ...validScene, sidewalkWidth: width }, true).valid).toBe(false);
  });

  it("keeps each numbered answer on its scale, as a whole number", () => {
    const tops = { overallAccessibility: 5, surfaceEvenness: 3, surfaceCondition: 3 };
    for (const [key, top] of Object.entries(tops)) {
      expect(validateSceneLevel({ ...validScene, [key]: 1 }, true).valid).toBe(true);
      expect(validateSceneLevel({ ...validScene, [key]: top }, true).valid).toBe(true);
      for (const bad of [0, top + 1, 2.5, true, "", "x"]) expect(validateSceneLevel({ ...validScene, [key]: bad }, true).valid).toBe(false);
    }
  });

  it("stores a numbered answer sent as text as a number", () => {
    const result = validateSceneLevel({ ...validScene, overallAccessibility: "4", surfaceEvenness: "3", surfaceCondition: "1" }, true);
    expect(result.sceneLevel).toMatchObject({ overallAccessibility: 4, surfaceEvenness: 3, surfaceCondition: 1 });
  });

  it("refuses no Step 1 answer, and anything that is not an object", () => {
    for (const hasSidewalk of [undefined, null, "true", 1]) expect(validateSceneLevel(validScene, hasSidewalk).valid).toBe(false);
    for (const scene of [null, undefined, "string", []]) expect(validateSceneLevel(scene, true).valid).toBe(false);
  });

  it("does not change the scene it is given", () => {
    const sent = { overallAccessibility: "4", surfaceEvenness: 1 };
    validateSceneLevel(sent, false);
    expect(sent).toEqual({ overallAccessibility: "4", surfaceEvenness: 1 });
  });
});

describe("isPresenceAnswer and the reload message (S15)", () => {
  it("takes exactly true or false", () => {
    expect(isPresenceAnswer(true)).toBe(true);
    expect(isPresenceAnswer(false)).toBe(true);
    for (const v of [undefined, null, "true", 0, 1]) expect(isPresenceAnswer(v)).toBe(false);
    expect(RELOAD_FOR_NEW_QUESTIONS).toBe("IMPRINT was updated. Please reload the page to see the new questions.");
  });
});

// Only a path (S15): no box is asked whether it is on the sidewalk
describe("validateBoxes with only a path", () => {
  const path = { requireSeverity: true, hasSidewalk: false };
  it("accepts real boxes with no onSidewalk, answered Yes with a severity or No", () => {
    expect(validateBoxes([{ obstructs: true, severity: 4 }, { obstructs: false, severity: null }], [{ obstructs: false }], path)).toEqual({ valid: true });
    expect(validateBoxes([{ comment: "not_an_object", obstructs: false, severity: null }], [], path)).toEqual({ valid: true });
  });

  it("refuses any sidewalk answer on a path box", () => {
    for (const onSidewalk of [true, false, null]) {
      expect(validateBoxes([{ onSidewalk, obstructs: false }], [], path)).toEqual({ valid: false, message: PATH_HAS_NO_SIDEWALK_ANSWER });
      expect(validateBoxes([], [{ onSidewalk, obstructs: false }], path)).toEqual({ valid: false, message: PATH_HAS_NO_SIDEWALK_ANSWER });
    }
    expect(PATH_HAS_NO_SIDEWALK_ANSWER).toBe("With only a path, objects have no sidewalk answer.");
  });

  it("keeps today's obstruction and severity rules", () => {
    expect(validateBoxes([{ obstructs: true }], [], path).valid).toBe(false);
    expect(validateBoxes([{ obstructs: true, severity: 6 }], [], path).valid).toBe(false);
    expect(validateBoxes([], [{}], path).valid).toBe(false);
  });

  it("keeps the sidewalk's rules for hasSidewalk true", () => {
    expect(validateBoxes([{ obstructs: false }], [], { hasSidewalk: true }).valid).toBe(false);
    expect(validateBoxes([{ onSidewalk: true, obstructs: false }], [], { hasSidewalk: true })).toEqual({ valid: true });
  });
});

describe("validateBoxes", () => {
  it("accepts valid boxes", () => {
    const selected = [{ onSidewalk: true, obstructs: true, severity: 3 }];
    const newOnes = [{ onSidewalk: true, obstructs: false }];
    expect(validateBoxes(selected, newOnes)).toEqual({ valid: true });
  });

  it("accepts empty arrays", () => {
    expect(validateBoxes([], [])).toEqual({ valid: true });
  });

  it("rejects non-array selectedObjectsID", () => {
    expect(validateBoxes("not-array", []).valid).toBe(false);
  });

  it("rejects non-array newObjects", () => {
    expect(validateBoxes([], "not-array").valid).toBe(false);
  });

  it("rejects when total boxes exceed MAX_BOXES_PER_IMAGE", () => {
    const many = Array.from({ length: 301 }, () => ({ onSidewalk: true, obstructs: false }));
    expect(validateBoxes(many, []).valid).toBe(false);
  });

  it("accepts exactly MAX_BOXES_PER_IMAGE boxes", () => {
    const exact = Array.from({ length: MAX_BOXES_PER_IMAGE }, () => ({ onSidewalk: true, obstructs: false }));
    expect(validateBoxes(exact, []).valid).toBe(true);
  });

  it("rejects box missing obstructs field", () => {
    expect(validateBoxes([{ onSidewalk: true, severity: 3 }], []).valid).toBe(false);
  });

  // S12 (2 Nov 2026): every real contributor box says whether it is on the sidewalk
  describe("the sidewalk answer", () => {
    const NO_ANSWER = "Every object must say whether it is on the sidewalk (onSidewalk: true/false).";
    const OFF_SIDEWALK = "An object not on the sidewalk must have obstructs: false and no severity.";

    it("requires onSidewalk true or false on every real box, suggestion or drawn", () => {
      for (const onSidewalk of [undefined, null, "yes", 1]) {
        expect(validateBoxes([{ obstructs: false, onSidewalk }], [])).toEqual({ valid: false, message: NO_ANSWER });
        expect(validateBoxes([], [{ obstructs: false, onSidewalk }])).toEqual({ valid: false, message: NO_ANSWER });
      }
    });

    it("accepts a box off the walking path with obstructs false and no severity", () => {
      const off = { onSidewalk: false, obstructs: false, severity: null, selected: false, isRejected: true };
      expect(validateBoxes([off], [{ onSidewalk: false, obstructs: false }])).toEqual({ valid: true });
    });

    it("refuses a box off the walking path that obstructs, has no answer, or has a severity", () => {
      expect(validateBoxes([{ onSidewalk: false, obstructs: true, severity: 3 }], [])).toEqual({ valid: false, message: OFF_SIDEWALK });
      expect(validateBoxes([], [{ onSidewalk: false }])).toEqual({ valid: false, message: OFF_SIDEWALK });
      expect(validateBoxes([], [{ onSidewalk: false, obstructs: false, severity: 2 }])).toEqual({ valid: false, message: OFF_SIDEWALK });
    });

    it("lets only a box on the walking path obstruct", () => {
      expect(validateBoxes([{ onSidewalk: true, obstructs: true, severity: 2 }], []).valid).toBe(true);
      expect(validateBoxes([{ onSidewalk: true, obstructs: false }], []).valid).toBe(true);
    });

    it("keeps Not an object boxes as they are, with no sidewalk answer", () => {
      expect(validateBoxes([{ comment: "not_an_object", obstructs: false, severity: null }], [])).toEqual({ valid: true });
      for (const onSidewalk of [true, false, null]) {
        expect(validateBoxes([{ comment: "not_an_object", obstructs: false, onSidewalk }], [])).toEqual({
          valid: false,
          message: "A box marked as not an object has no sidewalk answer.",
        });
      }
    });
  });

  it("rejects box with non-boolean obstructs", () => {
    expect(validateBoxes([{ onSidewalk: true, obstructs: "yes" }], []).valid).toBe(false);
  });

  it("rejects obstructing box without severity", () => {
    expect(validateBoxes([{ onSidewalk: true, obstructs: true }], []).valid).toBe(false);
  });

  it("rejects obstructing box with severity out of range (0)", () => {
    expect(validateBoxes([{ onSidewalk: true, obstructs: true, severity: 0 }], []).valid).toBe(false);
  });

  it("rejects obstructing box with severity out of range (6)", () => {
    expect(validateBoxes([{ onSidewalk: true, obstructs: true, severity: 6 }], []).valid).toBe(false);
  });

  it("does not require severity when obstructs is false", () => {
    expect(validateBoxes([{ onSidewalk: true, obstructs: false }], []).valid).toBe(true);
  });

  it("accepts a not-an-object suggestion with obstructs false", () => {
    expect(validateBoxes([{ comment: "not_an_object", obstructs: false }], []).valid).toBe(true);
  });

  it("rejects a not-an-object suggestion with obstructs true", () => {
    const result = validateBoxes([{ comment: "not_an_object", obstructs: true, severity: 3 }], []);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("not an object cannot be an obstruction");
  });

  it("rejects a not-an-object box in newObjects", () => {
    const result = validateBoxes([], [{ comment: "not_an_object", obstructs: false }]);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("Only model suggestions");
  });
});

// Annotators give no severity (3 Oct 2026)
describe("validateBoxes with requireSeverity false", () => {
  const noSeverity = { requireSeverity: false };

  it("accepts an obstructing box without severity", () => {
    expect(validateBoxes([{ onSidewalk: true, obstructs: true }], [{ onSidewalk: true, obstructs: true, severity: null }], noSeverity)).toEqual({ valid: true });
  });

  it("still rejects a non-boolean obstructs", () => {
    expect(validateBoxes([{ onSidewalk: true, obstructs: "yes" }], [], noSeverity).valid).toBe(false);
    expect(validateBoxes([], [{ severity: null }], noSeverity).valid).toBe(false);
  });

  it("keeps the array, box limit and not-an-object rules", () => {
    expect(validateBoxes("not-array", [], noSeverity).valid).toBe(false);
    const many = Array.from({ length: MAX_BOXES_PER_IMAGE + 1 }, () => ({ onSidewalk: true, obstructs: false }));
    expect(validateBoxes(many, [], noSeverity).valid).toBe(false);
    expect(validateBoxes([{ comment: "not_an_object", obstructs: true }], [], noSeverity).valid).toBe(false);
    expect(validateBoxes([], [{ comment: "not_an_object", obstructs: false }], noSeverity).valid).toBe(false);
  });

  it("requires severity by default", () => {
    expect(validateBoxes([{ onSidewalk: true, obstructs: true }], []).valid).toBe(false);
    expect(validateBoxes([{ onSidewalk: true, obstructs: true }], [], {}).valid).toBe(false);
  });
});

describe("normalizeAnnotatorSubmission", () => {
  const input = () => ({
    sceneLevel: { sidewalkWidth: "two_people", overallAccessibility: 3, surfaceEvenness: 3, surfaceType: "concrete", surfaceCondition: 2, roadBarrier: false },
    selectedObjectsID: [
      { id: "s1", comment: "tree", obstructs: true, severity: 4 },
      { id: "s2", comment: "not_an_object", obstructs: false, severity: null },
    ],
    newObjects: [{ id: "n1", comment: "car", obstructs: false, severity: 2 }],
  });

  it("sets sceneLevel and every severity to null", () => {
    const out = normalizeAnnotatorSubmission(input());
    expect(out.sceneLevel).toBeNull();
    for (const box of [...out.selectedObjectsID, ...out.newObjects]) expect(box.severity).toBeNull();
  });

  it("keeps the obstruction answer on real boxes and nulls it on Not an object boxes (Obstructions step, 4 Oct 2026)", () => {
    const out = normalizeAnnotatorSubmission(input());
    expect(out.selectedObjectsID[0]).toEqual({ id: "s1", comment: "tree", obstructs: true, severity: null });
    expect(out.selectedObjectsID[1]).toEqual({ id: "s2", comment: "not_an_object", obstructs: null, severity: null });
    expect(out.newObjects[0]).toEqual({ id: "n1", comment: "car", obstructs: false, severity: null });
  });

  it("returns the sidewalk outline unchanged for the route to check (6 Oct 2026)", () => {
    const sidewalkMask = { noSidewalk: false, polygons: [{ id: "w1", kind: "walk", points: [{ x: -1, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 5 }] }] };
    expect(normalizeAnnotatorSubmission({ ...input(), sidewalkMask }).sidewalkMask).toBe(sidewalkMask);
    expect(normalizeAnnotatorSubmission(input()).sidewalkMask).toBeUndefined();
  });

  it("does not mutate its input", () => {
    const original = input();
    const snapshot = structuredClone(original);
    const out = normalizeAnnotatorSubmission(original);
    expect(original).toEqual(snapshot);
    expect(out.selectedObjectsID).not.toBe(original.selectedObjectsID);
    expect(out.selectedObjectsID[0]).not.toBe(original.selectedObjectsID[0]);
  });

  it("passes non-array box lists through for validateBoxes to reject", () => {
    const out = normalizeAnnotatorSubmission({ sceneLevel: null, selectedObjectsID: undefined, newObjects: "x" });
    expect(validateBoxes(out.selectedObjectsID, out.newObjects, { requireSeverity: false }).valid).toBe(false);
  });
});

// Annotators, Objects then Obstructions (4 Oct 2026)
describe("validateAnnotatorBoxes", () => {
  const mark = { type: "RECT", x: 10, y: 10, width: 50, height: 50 };
  const kept = { id: "s1", editable: false, selected: true, isRejected: false, comment: "tree", obstructs: false, severity: null, mark };
  const notAnObject = { id: "s2", editable: false, selected: false, isRejected: true, comment: "not_an_object", obstructs: null, severity: null, mark };
  const drawn = { id: "d1", editable: true, comment: "car", obstructs: true, severity: null, mark };
  const ANSWER_MESSAGE = "Every object must have an obstruction answer (obstructs: true or false).";

  it("accepts real boxes answered true and false, and Not an object boxes with obstructs null", () => {
    expect(validateAnnotatorBoxes([kept, notAnObject], [drawn])).toEqual({ valid: true });
    expect(validateAnnotatorBoxes([{ ...kept, obstructs: true }], [{ ...drawn, obstructs: false }])).toEqual({ valid: true });
    expect(validateAnnotatorBoxes([], [])).toEqual({ valid: true });
  });

  it("refuses a real box whose obstruction answer is null or missing", () => {
    expect(validateAnnotatorBoxes([{ ...kept, obstructs: null }], []).message).toBe(ANSWER_MESSAGE);
    const drawnNoAnswer = { ...drawn };
    delete drawnNoAnswer.obstructs;
    expect(validateAnnotatorBoxes([], [drawnNoAnswer]).message).toBe(ANSWER_MESSAGE);
    expect(validateAnnotatorBoxes([], [{ ...drawn, obstructs: "yes" }]).message).toBe(ANSWER_MESSAGE);
  });

  it("leaves Not an object boxes with obstructs null once normalized", () => {
    const sent = { selectedObjectsID: [kept, { ...notAnObject, obstructs: true }], newObjects: [drawn] };
    const out = normalizeAnnotatorSubmission(sent);
    expect(out.selectedObjectsID[1].obstructs).toBeNull();
    expect(validateAnnotatorBoxes(out.selectedObjectsID, out.newObjects)).toEqual({ valid: true });
  });

  it("refuses a drawn box marked Not an object", () => {
    const r = validateAnnotatorBoxes([], [{ ...drawn, comment: "not_an_object" }]);
    expect(r.valid).toBe(false);
    expect(r.message).toContain("Only model suggestions");
  });

  it("refuses a free-text category on a drawn or kept box", () => {
    expect(validateAnnotatorBoxes([], [{ ...drawn, comment: "truck" }]).message).toBe("Every box must have a category from the list.");
    expect(validateAnnotatorBoxes([{ ...kept, comment: "truck" }], []).message).toBe("Every box must have a category from the list.");
  });

  it("refuses an undecided suggestion and an old No answer", () => {
    const message = "Every suggested box must be kept or marked not an object.";
    expect(validateAnnotatorBoxes([{ ...kept, selected: false }], []).message).toBe(message);
    expect(validateAnnotatorBoxes([{ ...kept, selected: false, isRejected: true, obstructs: false }], []).message).toBe(message);
  });

  it("refuses non-arrays and more than 300 boxes", () => {
    expect(validateAnnotatorBoxes("x", []).valid).toBe(false);
    expect(validateAnnotatorBoxes([], null).valid).toBe(false);
    const many = Array.from({ length: MAX_BOXES_PER_IMAGE + 1 }, (_, i) => ({ ...drawn, id: `d${i}` }));
    expect(validateAnnotatorBoxes([], many).message).toBe("Too many boxes for a single image.");
  });

  it("refuses a box without a numeric mark", () => {
    const message = "Every box must have a position (x, y, width and height).";
    expect(validateAnnotatorBoxes([], [{ ...drawn, mark: undefined }]).message).toBe(message);
    expect(validateAnnotatorBoxes([], [{ ...drawn, mark: { ...mark, width: "50" } }]).message).toBe(message);
    expect(validateAnnotatorBoxes([{ ...kept, mark: { ...mark, x: NaN } }], []).message).toBe(message);
  });
});

// Both roles (4 Oct 2026): boxes drawn up or to the left had negative sizes
describe("normalizeSubmittedMarks", () => {
  const box = (m, extra = {}) => ({ id: "b", comment: "tree", mark: m, ...extra });

  it("normalizes negative sizes and clamps to the image", () => {
    const [out] = normalizeSubmittedMarks([box({ type: "RECT", x: 120, y: 60, width: -40, height: -30 })], 100, 50);
    expect(out.mark).toEqual({ type: "RECT", x: 80, y: 30, width: 20, height: 20 });
  });

  it("normalizes even when the image size is unknown", () => {
    const [out] = normalizeSubmittedMarks([box({ x: 40, y: 40, width: -10, height: -10 })], undefined, undefined);
    expect(out.mark).toEqual({ x: 30, y: 30, width: 10, height: 10 });
  });

  it("leaves initialState, Not an object boxes and boxes without a mark alone", () => {
    const initialState = { comment: "tree", mark: { x: 50, y: 50, width: -10, height: -10 } };
    const [withInit] = normalizeSubmittedMarks([box({ x: 50, y: 50, width: -10, height: -10 }, { initialState })], 100, 100);
    expect(withInit.initialState).toBe(initialState);

    const nao = box({ x: 50, y: 50, width: -10, height: -10 }, { comment: "not_an_object" });
    const noMark = { id: "c", obstructs: false };
    const out = normalizeSubmittedMarks([nao, noMark], 100, 100);
    expect(out[0]).toBe(nao);
    expect(out[1]).toBe(noMark);
  });

  it("does not mutate its input and passes non-arrays through", () => {
    const input = [box({ x: 50, y: 50, width: -10, height: -10 })];
    const snapshot = structuredClone(input);
    const out = normalizeSubmittedMarks(input, 100, 100);
    expect(input).toEqual(snapshot);
    expect(out[0]).not.toBe(input[0]);
    expect(normalizeSubmittedMarks("x", 100, 100)).toBe("x");
  });
});

describe("hasEmptyBox", () => {
  it("is true when a real box has zero area", () => {
    expect(hasEmptyBox([{ comment: "tree", mark: { x: 0, y: 0, width: 0, height: 10 } }])).toBe(true);
  });

  it("is false for boxes with area, Not an object boxes and boxes without a mark", () => {
    expect(hasEmptyBox([
      { comment: "tree", mark: { x: 0, y: 0, width: 5, height: 10 } },
      { comment: "not_an_object", mark: { x: 0, y: 0, width: 0, height: 0 } },
      { comment: "car", obstructs: false },
    ])).toBe(false);
    expect(hasEmptyBox("x")).toBe(false);
  });
});

// The model's own values from the image record (S5, 29 Oct 2026)
describe("applyRecordSuggestions", () => {
  const mark = (x) => ({ type: "RECT", x, y: 10, width: 20, height: 30 });
  const list = [
    { id: "a", comment: "tree", confidence: 0.8, mark: mark(1) },
    { id: 7, comment: "car", confidence: 0.3, mark: mark(2) },
    { id: "c", comment: "bench", mark: mark(3) },
    { id: "d", comment: "car", confidence: Number.NaN, mark: mark(4) },
  ];

  it("replaces each suggestion's confidence and initialState with the record's, keeping the answer", () => {
    const result = applyRecordSuggestions(
      [{ id: "a", comment: "bollard", obstructs: true, severity: 2, confidence: 1, initialState: { comment: "x", mark: mark(9) }, mark: mark(5) }],
      list
    );
    expect(result).toEqual({
      valid: true,
      // No proposal on the record (S3): none stored, and none shown
      boxes: [{ id: "a", editable: false, comment: "bollard", obstructs: true, severity: 2, confidence: 0.8, initialState: { comment: "tree", mark: mark(1) }, mark: mark(5), proposalShown: false }],
    });
  });

  it("matches ids as strings, so a number id in the record matches", () => {
    expect(applyRecordSuggestions([{ id: "7" }], list).boxes[0].confidence).toBe(0.3);
  });

  it("gives null for a record suggestion with no confidence or one that is not a number", () => {
    const { boxes } = applyRecordSuggestions([{ id: "c" }, { id: "d" }], list);
    expect(boxes.map((b) => b.confidence)).toEqual([null, null]);
  });

  it("copies the record's mark, so the record is not changed through the stored box", () => {
    const { boxes } = applyRecordSuggestions([{ id: "a" }], list);
    boxes[0].initialState.mark.x = 999;
    expect(list[0].mark.x).toBe(1);
  });

  it("refuses a suggestion whose id the record does not have, or with no id", () => {
    const refused = { valid: false, message: "A suggested box does not belong to this image." };
    expect(applyRecordSuggestions([{ id: "a" }, { id: "zz" }], list)).toEqual(refused);
    expect(applyRecordSuggestions([{ comment: "tree" }], list)).toEqual(refused);
    expect(applyRecordSuggestions([null], list)).toEqual(refused);
    expect(applyRecordSuggestions([{ id: "a" }], undefined)).toEqual(refused);
  });

  it("passes through no suggestions, and anything that is not a list", () => {
    expect(applyRecordSuggestions([], list)).toEqual({ valid: true, boxes: [] });
    expect(applyRecordSuggestions(undefined, list)).toEqual({ valid: true, boxes: undefined });
  });
});

describe("clearDrawnModelFields", () => {
  it("gives every drawn box a null confidence and no initialState, keeping the rest", () => {
    const boxes = [{ id: "d1", comment: "tree", confidence: 0.7, initialState: { comment: "car" }, obstructs: true }, { id: "d2" }];
    // A drawn box has no proposal, so none was shown (S3)
    expect(clearDrawnModelFields(boxes)).toEqual([
      { id: "d1", comment: "tree", confidence: null, obstructs: true, proposalShown: false },
      { id: "d2", confidence: null, proposalShown: false },
    ]);
    expect(boxes[0].confidence).toBe(0.7);
  });

  it("leaves anything that is not a list, and entries that are not objects, alone", () => {
    expect(clearDrawnModelFields(undefined)).toBeUndefined();
    expect(clearDrawnModelFields([null, 3])).toEqual([null, 3]);
  });
});

describe("withRecordConfidences", () => {
  const list = [{ id: "a", confidence: 0.8 }, { id: 2, confidence: 0.1 }, { id: "c" }];

  it("takes each entry's confidence from the record by id and drops ids it does not have", () => {
    const telemetry = {
      imageDurationMs: 4000,
      suggestionConfidences: [
        { id: "a", confidence: 0.99, disposition: "accepted" },
        { id: "2", confidence: 0.99, disposition: "hidden_below_tau" },
        { id: "c", confidence: 0.99, disposition: "removed" },
        { id: "zz", confidence: 0.5, disposition: "accepted" },
        null,
      ],
    };
    expect(withRecordConfidences(telemetry, list)).toEqual({
      imageDurationMs: 4000,
      // No proposals on this record, and no submitted boxes (S3)
      suggestionConfidences: [
        { id: "a", confidence: 0.8, disposition: "accepted", proposedObstructs: null, proposalShown: false },
        { id: "2", confidence: 0.1, disposition: "hidden_below_tau", proposedObstructs: null, proposalShown: false },
        { id: "c", confidence: null, disposition: "removed", proposedObstructs: null, proposalShown: false },
      ],
    });
    expect(telemetry.suggestionConfidences[0].confidence).toBe(0.99);
  });

  it("drops every entry when the record has no suggestions", () => {
    expect(withRecordConfidences({ suggestionConfidences: [{ id: "a", confidence: 1 }] }, undefined)).toEqual({ suggestionConfidences: [] });
  });

  it("leaves telemetry with no list of entries alone", () => {
    expect(withRecordConfidences({ imageDurationMs: 1 }, list)).toEqual({ imageDurationMs: 1 });
    expect(withRecordConfidences({ suggestionConfidences: "x" }, list)).toEqual({ suggestionConfidences: "x" });
    expect(withRecordConfidences(undefined, list)).toBeUndefined();
  });
});

// S3 (6 Nov 2026): the classifier's proposal, copied from the image record
describe("the classifier's proposal from the record (S3)", () => {
  const mark = (x) => ({ type: "RECT", x, y: 10, width: 20, height: 30 });
  const list = [
    { id: "yes", comment: "tree", confidence: 0.8, mark: mark(1), proposedObstructs: true, obstructionProbability: 0.71 },
    { id: "no", comment: "car", confidence: 0.4, mark: mark(2), proposedObstructs: false, obstructionProbability: 0.08 },
    { id: "none", comment: "bench", confidence: 0.6, mark: mark(3) },
    { id: "bare", comment: "bench", confidence: 0.6, mark: mark(4), proposedObstructs: true },
  ];
  const on = (id, extra = {}) => ({ id, comment: "tree", mark: mark(9), onSidewalk: true, obstructs: false, ...extra });
  const one = (box, options) => applyRecordSuggestions([box], list, options).boxes[0];

  describe("applyRecordSuggestions", () => {
    it("stores the record's proposal in initialState and proposalShown true for a box that reached Question 2", () => {
      expect(one(on("yes"))).toEqual({
        ...on("yes"),
        editable: false,
        confidence: 0.8,
        initialState: { comment: "tree", mark: mark(1), proposedObstructs: true, obstructionProbability: 0.71 },
        proposalShown: true,
      });
      // A proposal of false is stored but never shown (6 Nov 2026)
      const no = one(on("no", { obstructs: true, severity: 3 }));
      expect(no.initialState).toEqual({ comment: "car", mark: mark(2), proposedObstructs: false, obstructionProbability: 0.08 });
      expect(no.proposalShown).toBe(false);
    });

    it("stores each field only when the record has it", () => {
      expect(one(on("bare")).initialState).toEqual({ comment: "bench", mark: mark(4), proposedObstructs: true });
      expect(one(on("bare")).proposalShown).toBe(true);
      const none = one(on("none"));
      expect(none.initialState).toEqual({ comment: "bench", mark: mark(3) });
      expect(none.proposalShown).toBe(false);
    });

    it("gives proposalShown false for a box off the path and a Not an object box, with the proposal still stored", () => {
      const off = one(on("yes", { onSidewalk: false, obstructs: false }));
      expect(off.proposalShown).toBe(false);
      expect(off.initialState.proposedObstructs).toBe(true);
      const notAnObject = one({ id: "no", comment: "not_an_object", isRejected: true, obstructs: false, mark: mark(2) });
      expect(notAnObject.proposalShown).toBe(false);
      expect(notAnObject.initialState.proposedObstructs).toBe(false);
    });

    it("cannot be changed by a tampered request", () => {
      const tampered = on("none", {
        proposedObstructs: true,
        obstructionProbability: 0.99,
        proposalShown: true,
        initialState: { comment: "tree", mark: mark(9), proposedObstructs: true, obstructionProbability: 0.99 },
      });
      const stored = one(tampered);
      expect(stored.initialState).toEqual({ comment: "bench", mark: mark(3) });
      expect(stored.proposalShown).toBe(false);
      expect(stored).not.toHaveProperty("proposedObstructs");
      expect(stored).not.toHaveProperty("obstructionProbability");

      // A proposal of true on the record stays true whatever is sent
      const flipped = one(on("yes", { proposedObstructs: false, proposalShown: false, initialState: { proposedObstructs: false, obstructionProbability: 0.01 } }));
      expect(flipped.initialState).toEqual({ comment: "tree", mark: mark(1), proposedObstructs: true, obstructionProbability: 0.71 });
      expect(flipped.proposalShown).toBe(true);
      expect(flipped).not.toHaveProperty("proposedObstructs");
    });

    it("gives every annotator box proposalShown false, with the record's proposal stored", () => {
      const stored = one(on("yes"), { isAnnotator: true });
      expect(stored.proposalShown).toBe(false);
      expect(stored.initialState.proposedObstructs).toBe(true);
    });

    it("does not change the record", () => {
      const before = JSON.parse(JSON.stringify(list));
      one(on("yes"));
      expect(list).toEqual(before);
    });
    // Only a path (S15): the one question carries the hint, so it was shown
    // for every real box whose record proposes that it obstructs
    it("gives proposalShown true for a path's box proposed to obstruct, without a sidewalk answer", () => {
      const pathBox = (id, extra = {}) => ({ id, comment: "tree", mark: mark(9), obstructs: false, ...extra });
      const path = { hasSidewalk: false };
      expect(one(pathBox("yes"), path).proposalShown).toBe(true);
      expect(one(pathBox("bare", { obstructs: true, severity: 2 }), path).proposalShown).toBe(true);
      expect(one(pathBox("no"), path).proposalShown).toBe(false);
      expect(one(pathBox("none"), path).proposalShown).toBe(false);
      expect(one({ id: "yes", comment: "not_an_object", isRejected: true, obstructs: false, mark: mark(1) }, path).proposalShown).toBe(false);
      expect(one(pathBox("yes"), { ...path, isAnnotator: true }).proposalShown).toBe(false);
      // The same box for a sidewalk, with no sidewalk answer, never reached Question 2
      expect(one(pathBox("yes")).proposalShown).toBe(false);
    });

    it("sets the telemetry's proposalShown by the same rule for a path", () => {
      const telemetry = { suggestionConfidences: [{ id: "yes" }, { id: "no" }] };
      const boxes = [{ id: "yes", comment: "tree", obstructs: true, severity: 3 }, { id: "no", comment: "car", obstructs: false }];
      const out = withRecordConfidences(telemetry, list, { boxes, hasSidewalk: false });
      expect(out.suggestionConfidences.map((e) => e.proposalShown)).toEqual([true, false]);
      expect(withRecordConfidences(telemetry, list, { boxes }).suggestionConfidences.map((e) => e.proposalShown)).toEqual([false, false]);
    });
  });

  describe("clearDrawnModelFields", () => {
    it("drops any proposal sent with a drawn box and stores proposalShown false", () => {
      const [drawn] = clearDrawnModelFields([{ id: "d", comment: "tree", onSidewalk: true, obstructs: false, proposedObstructs: true, obstructionProbability: 0.9, proposalShown: true, initialState: { proposedObstructs: true } }]);
      expect(drawn).toEqual({ id: "d", comment: "tree", onSidewalk: true, obstructs: false, confidence: null, proposalShown: false });
    });
  });

  describe("withRecordConfidences", () => {
    const boxes = [on("yes"), on("no", { onSidewalk: false }), on("none"), { id: "bare", comment: "not_an_object", obstructs: false }];
    const entry = (id, extra = {}) => ({ id, confidence: 0.5, disposition: "accepted", obstructs: false, ...extra });

    it("sets each entry's proposal and whether it was shown from the record and the submitted box", () => {
      const telemetry = { suggestionConfidences: [entry("yes"), entry("no", { disposition: "off_sidewalk" }), entry("none"), entry("bare", { disposition: "removed" })] };
      const out = withRecordConfidences(telemetry, list, { boxes });
      expect(out.suggestionConfidences.map(({ id, proposedObstructs, proposalShown }) => ({ id, proposedObstructs, proposalShown }))).toEqual([
        { id: "yes", proposedObstructs: true, proposalShown: true },
        // Off the path: Question 2 never showed
        { id: "no", proposedObstructs: false, proposalShown: false },
        { id: "none", proposedObstructs: null, proposalShown: false },
        // Not an object: no sidewalk answer
        { id: "bare", proposedObstructs: true, proposalShown: false },
      ]);
    });

    it("overwrites tampered fields, and gives an entry with no submitted box (hidden below tau) proposalShown false", () => {
      const telemetry = {
        suggestionConfidences: [
          entry("none", { proposedObstructs: true, proposalShown: true }),
          entry("yes", { proposedObstructs: false, proposalShown: false }),
          entry("no", { disposition: "hidden_below_tau", obstructs: null, proposedObstructs: true, proposalShown: true }),
        ],
      };
      const out = withRecordConfidences(telemetry, list, { boxes: [on("none"), on("yes")] });
      expect(out.suggestionConfidences.map((e) => [e.id, e.proposedObstructs, e.proposalShown])).toEqual([
        ["none", null, false],
        ["yes", true, true],
        ["no", false, false],
      ]);
    });

    it("gives annotators proposalShown false", () => {
      const out = withRecordConfidences({ suggestionConfidences: [entry("yes")] }, list, { boxes, isAnnotator: true });
      expect(out.suggestionConfidences[0]).toMatchObject({ proposedObstructs: true, proposalShown: false });
    });
  });
});

describe("constants", () => {
  it("MAX_BOXES_PER_IMAGE is 300", () => {
    expect(MAX_BOXES_PER_IMAGE).toBe(300);
  });

  it("SIDEWALK_WIDTH_OPTIONS has 3 entries, from sceneQuestions.mjs, with no no_sidewalk (S15)", () => {
    expect(SIDEWALK_WIDTH_OPTIONS).toEqual(["one_person", "two_people", "three_or_more"]);
    expect(SIDEWALK_WIDTH_OPTIONS).toBe(SHARED_WIDTHS);
  });
});
