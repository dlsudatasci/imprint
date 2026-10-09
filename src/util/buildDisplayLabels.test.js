import { describe, it, expect } from "vitest";
import { formatLabel, buildDisplayLabels, buildDisplayLabelsInOrder, orderOfAppearance, compareAppearance } from "./buildDisplayLabels";

describe("formatLabel", () => {
  it("title-cases a single word", () => {
    expect(formatLabel("tree")).toBe("Tree");
  });

  it("title-cases underscore-separated words", () => {
    expect(formatLabel("fire_hydrant")).toBe("Fire Hydrant");
  });

  it("handles multiple underscores", () => {
    expect(formatLabel("construction_materials")).toBe("Construction Materials");
  });

  it("returns null for undefined", () => {
    expect(formatLabel(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(formatLabel("")).toBeNull();
  });

  it("returns null for placeholder '---'", () => {
    expect(formatLabel("---")).toBeNull();
  });

  it("returns 'Not an object' for not_an_object", () => {
    expect(formatLabel("not_an_object")).toBe("Not an object");
  });
});

describe("buildDisplayLabels", () => {
  it("returns an empty map for an empty array", () => {
    const result = buildDisplayLabels([]);
    expect(result.size).toBe(0);
  });

  it("returns a plain label for a single annotation", () => {
    const result = buildDisplayLabels([{ id: "a", comment: "tree" }]);
    expect(result.get("a")).toBe("Tree");
  });

  it("numbers duplicate categories", () => {
    const result = buildDisplayLabels([
      { id: "a", comment: "tree" },
      { id: "b", comment: "tree" },
    ]);
    expect(result.get("a")).toBe("Tree #1");
    expect(result.get("b")).toBe("Tree #2");
  });

  it("numbers three of the same category", () => {
    const result = buildDisplayLabels([
      { id: "a", comment: "bollard" },
      { id: "b", comment: "bollard" },
      { id: "c", comment: "bollard" },
    ]);
    expect(result.get("a")).toBe("Bollard #1");
    expect(result.get("b")).toBe("Bollard #2");
    expect(result.get("c")).toBe("Bollard #3");
  });

  it("does not number singleton categories", () => {
    const result = buildDisplayLabels([
      { id: "a", comment: "tree" },
      { id: "b", comment: "bollard" },
    ]);
    expect(result.get("a")).toBe("Tree");
    expect(result.get("b")).toBe("Bollard");
  });

  it("numbers only the duplicated category in a mix", () => {
    const result = buildDisplayLabels([
      { id: "a", comment: "tree" },
      { id: "b", comment: "bollard" },
      { id: "c", comment: "tree" },
    ]);
    expect(result.get("a")).toBe("Tree #1");
    expect(result.get("b")).toBe("Bollard");
    expect(result.get("c")).toBe("Tree #2");
  });

  it("returns null for unlabeled annotations (undefined comment)", () => {
    const result = buildDisplayLabels([{ id: "a" }]);
    expect(result.get("a")).toBeNull();
  });

  it("returns null for empty-string comment", () => {
    const result = buildDisplayLabels([{ id: "a", comment: "" }]);
    expect(result.get("a")).toBeNull();
  });

  it("returns null for placeholder '---' comment", () => {
    const result = buildDisplayLabels([{ id: "a", comment: "---" }]);
    expect(result.get("a")).toBeNull();
  });

  it("handles a mix of labeled and unlabeled annotations", () => {
    const result = buildDisplayLabels([
      { id: "a", comment: "tree" },
      { id: "b", comment: "" },
      { id: "c", comment: "tree" },
      { id: "d", comment: "---" },
    ]);
    expect(result.get("a")).toBe("Tree #1");
    expect(result.get("b")).toBeNull();
    expect(result.get("c")).toBe("Tree #2");
    expect(result.get("d")).toBeNull();
  });

  it("does not count unlabeled annotations toward duplicates", () => {
    const result = buildDisplayLabels([
      { id: "a", comment: "tree" },
      { id: "b", comment: "" },
      { id: "c", comment: undefined },
    ]);
    expect(result.get("a")).toBe("Tree");
  });

  it("assigns numbers in input order", () => {
    const result = buildDisplayLabels([
      { id: "z", comment: "bench" },
      { id: "a", comment: "bench" },
    ]);
    expect(result.get("z")).toBe("Bench #1");
    expect(result.get("a")).toBe("Bench #2");
  });

  it("handles multi-word underscore labels with duplicates", () => {
    const result = buildDisplayLabels([
      { id: "a", comment: "fire_hydrant" },
      { id: "b", comment: "fire_hydrant" },
    ]);
    expect(result.get("a")).toBe("Fire Hydrant #1");
    expect(result.get("b")).toBe("Fire Hydrant #2");
  });

  it("returns a Map keyed by annotation id", () => {
    const result = buildDisplayLabels([{ id: "abc123", comment: "tree" }]);
    expect(result).toBeInstanceOf(Map);
    expect(result.has("abc123")).toBe(true);
  });
});

// Numbering in order of appearance (8 Oct 2026): the photo and the lists
// number the same boxes the same way, and the numbers follow the model's order
// and then the order boxes were drawn
describe("orderOfAppearance", () => {
  const sug = (id, comment = "lamp_post") => ({ id, comment, editable: false });
  const drew = (id, drawnOrder, comment = "lamp_post") => ({ id, comment, editable: true, ...(drawnOrder === undefined ? {} : { drawnOrder }) });

  it("puts suggestions in the model's order, counting past ten as numbers", () => {
    const ids = orderOfAppearance([sug("pred-10"), sug("pred-2"), sug("pred-0"), sug("pred-11"), sug("pred-1")]).map((b) => b.id);
    expect(ids).toEqual(["pred-0", "pred-1", "pred-2", "pred-10", "pred-11"]);
  });

  it("puts drawn boxes after every suggestion, in the order drawn, whatever their ids", () => {
    const ids = orderOfAppearance([drew("aaa", 300), sug("pred-3"), drew("zzz", 100), drew("mmm", 200), sug("pred-0")]).map((b) => b.id);
    expect(ids).toEqual(["pred-0", "pred-3", "zzz", "mmm", "aaa"]);
  });

  it("puts drawn boxes without a drawn time last, by id", () => {
    const ids = orderOfAppearance([drew("kB2", undefined), drew("Ax9", 50), drew("aQ3", undefined)]).map((b) => b.id);
    expect(ids[0]).toBe("Ax9");
    expect(ids.slice(1).sort()).toEqual(["aQ3", "kB2"]);
    expect(compareAppearance(drew("x", undefined), drew("y", 1))).toBeGreaterThan(0);
  });

  it("does not reorder the array it is given", () => {
    const boxes = [sug("pred-9"), sug("pred-1")];
    orderOfAppearance(boxes);
    expect(boxes.map((b) => b.id)).toEqual(["pred-9", "pred-1"]);
    expect(orderOfAppearance(null)).toEqual([]);
  });
});

describe("buildDisplayLabelsInOrder", () => {
  const sug = (id, comment = "lamp_post") => ({ id, comment, editable: false });
  const drew = (id, drawnOrder, comment = "lamp_post") => ({ id, comment, editable: true, drawnOrder });

  it("numbers same-category boxes in order of appearance, whatever order they arrive in", () => {
    const boxes = [sug("pred-10"), drew("Xk4", 500), sug("pred-2"), sug("pred-3", "tree"), drew("ab2", 900)];
    const expected = new Map([
      ["pred-2", "Lamp Post #1"],
      ["pred-10", "Lamp Post #2"],
      ["Xk4", "Lamp Post #3"],
      ["ab2", "Lamp Post #4"],
      ["pred-3", "Tree"],
    ]);
    // The canvas moves a clicked box to the end of its list
    for (const order of [[0, 1, 2, 3, 4], [4, 3, 2, 1, 0], [2, 4, 0, 3, 1]]) {
      const labels = buildDisplayLabelsInOrder(order.map((i) => boxes[i]));
      for (const [id, label] of expected) expect(labels.get(id)).toBe(label);
    }
  });

  it("gives a newly drawn box the next number without renumbering the others", () => {
    const before = [sug("pred-0"), sug("pred-1"), drew("Zz9", 100)];
    const after = [...before, drew("Aa1", 200)];
    const a = buildDisplayLabelsInOrder(before);
    const b = buildDisplayLabelsInOrder(after);
    for (const box of before) expect(b.get(box.id)).toBe(a.get(box.id));
    expect(b.get("Aa1")).toBe("Lamp Post #4");
  });
});
