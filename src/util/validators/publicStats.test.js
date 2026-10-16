import { describe, it, expect } from "vitest";
import {
  OBSTRUCTION_COND,
  ANNOTATION_OBSTRUCTIONS,
  commonObstructionsPipeline,
  obstructionsPerImagePipeline,
} from "./publicStats";

/**
 * The few aggregation operators the rule uses ($and, $eq, $ne, $ifNull,
 * $concatArrays, $filter, field paths), evaluated the way MongoDB does, so
 * the rule can be checked on real-shaped annotations without a database.
 */
function evaluate(expr, doc, vars = {}) {
  if (typeof expr === "string" && expr.startsWith("$$")) {
    const [name, ...path] = expr.slice(2).split(".");
    return path.reduce((v, k) => (v == null ? undefined : v[k]), vars[name]);
  }
  if (typeof expr === "string" && expr.startsWith("$")) {
    return expr.slice(1).split(".").reduce((v, k) => (v == null ? undefined : v[k]), doc);
  }
  if (Array.isArray(expr)) return expr.map((e) => evaluate(e, doc, vars));
  if (expr === null || typeof expr !== "object") return expr;
  const [op, arg] = Object.entries(expr)[0];
  switch (op) {
    case "$and":
      return arg.every((e) => evaluate(e, doc, vars));
    case "$eq":
      return evaluate(arg[0], doc, vars) === evaluate(arg[1], doc, vars);
    case "$ne":
      return evaluate(arg[0], doc, vars) !== evaluate(arg[1], doc, vars);
    case "$ifNull": {
      const v = evaluate(arg[0], doc, vars);
      return v == null ? evaluate(arg[1], doc, vars) : v;
    }
    case "$concatArrays":
      return arg.flatMap((e) => evaluate(e, doc, vars));
    case "$filter":
      return evaluate(arg.input, doc, vars).filter((item) => evaluate(arg.cond, doc, { ...vars, [arg.as]: item }));
    default:
      throw new Error(`Operator not covered here: ${op}`);
  }
}

const counts = (box) => evaluate(OBSTRUCTION_COND, {}, { b: box });

// An annotation as annotationSubmit stores it for a contributor
const annotation = {
  selectedObjectsID: [
    { id: "s1", comment: "tree", obstructs: true, severity: 2 }, // Yes
    { id: "s2", comment: "car", obstructs: false, severity: null }, // No
    { id: "s3", comment: "not_an_object", obstructs: false, severity: null }, // Not an object
  ],
  newObjects: [
    { id: "d1", comment: "lamp_post", obstructs: true, severity: 4 }, // drawn, Yes
    { id: "d2", comment: "bench", obstructs: false, severity: null }, // drawn, No
  ],
};

describe("what the landing page counts as an obstruction", () => {
  it("counts a box answered Yes, suggested or drawn", () => {
    expect(counts({ comment: "tree", obstructs: true })).toBe(true);
    expect(counts({ comment: "lamp_post", obstructs: true, severity: 4 })).toBe(true);
  });

  it("does not count a box answered No, or one marked Not an object", () => {
    expect(counts({ comment: "car", obstructs: false })).toBe(false);
    expect(counts({ comment: "not_an_object", obstructs: false })).toBe(false);
  });

  it("does not count a box on the old isObstruction field, nor one with no answer", () => {
    expect(counts({ comment: "tree", isObstruction: true })).toBe(false);
    expect(counts({ comment: "tree" })).toBe(false);
    expect(JSON.stringify(OBSTRUCTION_COND)).not.toContain("isObstruction");
  });

  it("takes an annotation's obstructions from both its suggestions and its drawn boxes", () => {
    expect(evaluate(ANNOTATION_OBSTRUCTIONS, annotation).map((b) => b.id)).toEqual(["s1", "d1"]);
    expect(evaluate(ANNOTATION_OBSTRUCTIONS, {})).toEqual([]);
  });

  it("uses the one rule for the common obstructions and the average per image", () => {
    const filter = { source: { $ne: "annotator" } };
    const common = commonObstructionsPipeline(filter);
    const average = obstructionsPerImagePipeline(filter);
    expect(common[0]).toEqual({ $match: filter });
    expect(average[0]).toEqual({ $match: filter });
    expect(common[1]).toEqual({ $project: { boxes: ANNOTATION_OBSTRUCTIONS } });
    expect(average[1]).toEqual({ $project: { n: { $size: ANNOTATION_OBSTRUCTIONS } } });
    expect(JSON.stringify([common, average])).not.toContain("isObstruction");
    expect(common.at(-1)).toEqual({ $limit: 5 });
  });
});
