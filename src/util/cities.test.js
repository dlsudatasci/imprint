import { describe, it, expect } from "vitest";
import { normalizeCityName } from "./cities.js";

describe("normalizeCityName", () => {
  it("lowercases and strips spaces", () => {
    expect(normalizeCityName("Quezon City")).toBe("quezoncity");
  });

  it("replaces ñ with n", () => {
    expect(normalizeCityName("Las Piñas")).toBe("laspinas");
  });

  it("handles uppercase input", () => {
    expect(normalizeCityName("MANILA")).toBe("manila");
  });

  it("strips hyphens and special characters", () => {
    expect(normalizeCityName("San Juan!")).toBe("sanjuan");
    expect(normalizeCityName("Quezon-City")).toBe("quezoncity");
  });

  it("returns already-slugified input unchanged", () => {
    expect(normalizeCityName("makati")).toBe("makati");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeCityName("")).toBe("");
  });

  it("returns empty string for non-string input", () => {
    expect(normalizeCityName(null)).toBe("");
    expect(normalizeCityName(undefined)).toBe("");
    expect(normalizeCityName(123)).toBe("");
    expect(normalizeCityName(["array"])).toBe("");
  });
});
