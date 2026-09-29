import { describe, it, expect } from "vitest";
import { TAXONOMY_CATEGORIES, TAXONOMY_SET, isTaxonomyCategory } from "./taxonomy";

describe("TAXONOMY_CATEGORIES", () => {
  it("has exactly 18 categories", () => {
    expect(TAXONOMY_CATEGORIES).toHaveLength(18);
  });

  it("has no duplicates", () => {
    expect(new Set(TAXONOMY_CATEGORIES).size).toBe(TAXONOMY_CATEGORIES.length);
  });

  it("is sorted alphabetically", () => {
    const sorted = [...TAXONOMY_CATEGORIES].sort();
    expect(TAXONOMY_CATEGORIES).toEqual(sorted);
  });

  it("includes all UI dropdown categories except cracked_pavement", () => {
    const uiCategories = [
      "bench", "car", "construction_materials",
      "garbage", "lamp_post", "motorcycle", "potted_plant",
      "street_sign", "street_vendor_cart", "tree", "tricycle", "utility_post",
    ];
    for (const cat of uiCategories) {
      expect(TAXONOMY_SET.has(cat)).toBe(true);
    }
    // cracked_pavement is a UI option but not a model taxonomy category
    expect(TAXONOMY_SET.has("cracked_pavement")).toBe(false);
  });

  it("includes model-only categories not in the UI dropdown", () => {
    const modelOnly = [
      "bicycle", "bollard", "electrical_box", "fire_hydrant",
      "movable_signage", "trash_bin",
    ];
    for (const cat of modelOnly) {
      expect(TAXONOMY_SET.has(cat)).toBe(true);
    }
  });
});

describe("isTaxonomyCategory", () => {
  it("returns true for a taxonomy category", () => {
    expect(isTaxonomyCategory("bench")).toBe(true);
    expect(isTaxonomyCategory("fire_hydrant")).toBe(true);
  });

  it("returns false for a custom category", () => {
    expect(isTaxonomyCategory("sari_sari_store")).toBe(false);
    expect(isTaxonomyCategory("custom text here")).toBe(false);
  });

  it("returns false for empty/null/undefined", () => {
    expect(isTaxonomyCategory("")).toBe(false);
    expect(isTaxonomyCategory(null)).toBe(false);
    expect(isTaxonomyCategory(undefined)).toBe(false);
  });
});
