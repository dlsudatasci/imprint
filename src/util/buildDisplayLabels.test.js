import { describe, it, expect } from "vitest";
import { formatLabel, buildDisplayLabels } from "./buildDisplayLabels";

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
