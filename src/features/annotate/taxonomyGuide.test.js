import { describe, it, expect } from "vitest";
import { TAXONOMY_GUIDE, TAXONOMY_RULES } from "./taxonomyGuide.js";
import { TAXONOMY_CATEGORIES } from "@/util/taxonomy";

const allItems = () => TAXONOMY_GUIDE.flatMap((g) => g.items);

describe("TAXONOMY_GUIDE", () => {
  it("covers exactly the 18 taxonomy categories", () => {
    const values = allItems().map((i) => i.value);
    expect(values).toHaveLength(18);
    expect([...values].sort()).toEqual([...TAXONOMY_CATEGORIES].sort());
  });

  it("has 8 temporary and 10 permanent categories in the manuscript table's order", () => {
    expect(TAXONOMY_GUIDE.map((g) => g.group)).toEqual(["Temporary", "Permanent"]);
    expect(TAXONOMY_GUIDE[0].items.map((i) => i.value)).toEqual([
      "car", "motorcycle", "tricycle", "bicycle", "street_vendor_cart",
      "construction_materials", "garbage", "movable_signage",
    ]);
    expect(TAXONOMY_GUIDE[1].items.map((i) => i.value)).toEqual([
      "trash_bin", "utility_post", "lamp_post", "street_sign", "fire_hydrant",
      "electrical_box", "bench", "tree", "potted_plant", "bollard",
    ]);
  });

  it("never says 'sidewalk' in a description, since annotators box these anywhere", () => {
    for (const i of allItems()) expect(i.description.toLowerCase()).not.toContain("sidewalk");
  });

  it("names van, jeepney, truck and bus under Car", () => {
    const car = allItems().find((i) => i.value === "car");
    expect(car.label).toBe("Car");
    for (const word of ["van", "jeepney", "truck", "bus"]) expect(car.description).toContain(word);
  });

  it("boxes a sign on its own post down to the ground", () => {
    const sign = allItems().find((i) => i.value === "street_sign");
    expect(sign.description).toMatch(/own post is one box down to the ground/);
  });
});

describe("TAXONOMY_RULES", () => {
  it("covers the codebook rules and the sign decision", () => {
    expect(TAXONOMY_RULES).toHaveLength(8);
    const text = TAXONOMY_RULES.join(" ");
    expect(text).toMatch(/on the sidewalk or not/);
    expect(text).toMatch(/20 by 20 pixels/);
    expect(text).toMatch(/a quarter or more is visible/);
    expect(text).toMatch(/fixed to a utility post or lamp post is not boxed on its own/);
    expect(text).toMatch(/mark the other Not an object/);
  });

  it("has no em dash or semicolon in any entry or rule", () => {
    for (const i of allItems()) {
      expect(`${i.label} ${i.description}`).not.toMatch(/[—;]/);
    }
    for (const r of TAXONOMY_RULES) expect(r).not.toMatch(/[—;]/);
  });
});
