import { describe, it, expect } from "vitest";
import { CATEGORY_OPTIONS } from "./categoryOptions.js";
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
