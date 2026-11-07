import { describe, it, expect } from "vitest";
import { CATEGORY_OPTIONS, matchCategory, categoryKey } from "./categoryOptions.js";
import { TAXONOMY_CATEGORIES } from "./taxonomy.js";

describe("CATEGORY_OPTIONS", () => {
  it("has exactly the 18 taxonomy values, in taxonomy order", () => {
    expect(CATEGORY_OPTIONS).toHaveLength(18);
    expect(CATEGORY_OPTIONS.map((o) => o.value)).toEqual(TAXONOMY_CATEGORIES);
  });

  it("offers no free-text Other and no Not an object entry", () => {
    const values = CATEGORY_OPTIONS.map((o) => o.value);
    expect(values).not.toContain("OTHER_CUSTOM");
    expect(values).not.toContain("not_an_object");
  });

  it("gives every value a label", () => {
    for (const o of CATEGORY_OPTIONS) expect(o.label).toBeTruthy();
  });

  it("labels Car as just \"Car\" (6 Oct 2026), the vehicle rule living in the What to Box list", () => {
    const car = CATEGORY_OPTIONS.find((o) => o.value === "car");
    expect(car.label).toBe("Car");
  });

  it("has no em dash or semicolon in any label", () => {
    for (const o of CATEGORY_OPTIONS) expect(o.label).not.toMatch(/[—;]/);
  });
});

// S20 (7 Nov 2026): one rule for a category written two ways
describe("matchCategory and categoryKey", () => {
  it("read a value, its label in any case, and the value with spaces as the same option", () => {
    for (const written of ["utility_post", "Utility Post", "utility post", "UTILITY POST"]) {
      expect(matchCategory(written)?.value).toBe("utility_post");
      expect(categoryKey(written)).toBe("utility_post");
    }
  });

  it("leave a category typed in with Other..., Not an object and an empty value as written", () => {
    expect(matchCategory("jeepney stop")).toBeNull();
    expect(categoryKey("jeepney stop")).toBe("jeepney stop");
    expect(categoryKey("Jeepney Stop")).toBe("Jeepney Stop");
    expect(categoryKey("not_an_object")).toBe("not_an_object");
    expect(categoryKey("")).toBe("");
    expect(matchCategory(undefined)).toBeNull();
  });

  it("do not match a value in another case: only labels are read without case", () => {
    expect(matchCategory("Utility_Post")).toBeNull();
  });
});
