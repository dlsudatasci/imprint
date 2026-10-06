import { describe, it, expect } from "vitest";
import boundaries from "./cityBoundaries.json";
import { normalizeCityName } from "@/util/cities";
import { IMPRINT_CITIES } from "@/util/validators/imageImport.mjs";

// Landing-page map outlines, regenerated 2 Oct 2026 for the study cities
// (thesis scripts: pipeline_docs/scripts/make_imprint_city_boundaries.py).
// Caloocan is hidden from the map: only 2 corpus images and none served to
// contributors (decided 2 Oct 2026). It stays a study city everywhere else.
const HIDDEN = new Set(["caloocan"]);
const features = boundaries.features;

function rings(geometry) {
  return geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
}

describe("cityBoundaries", () => {
  it("draws the study cities except Caloocan", () => {
    expect(features).toHaveLength(11);
    const slugs = features.map((f) => normalizeCityName(f.properties.name));
    expect(new Set(slugs)).toEqual(new Set([...IMPRINT_CITIES].filter((c) => !HIDDEN.has(c))));
  });

  it("gives every city its own colour", () => {
    const colors = features.map((f) => f.properties.color);
    expect(colors.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
    expect(new Set(colors).size).toBe(features.length);
  });

  it("uses polygons with closed rings inside Metro Manila", () => {
    for (const f of features) {
      expect(["Polygon", "MultiPolygon"]).toContain(f.geometry.type);
      for (const ring of rings(f.geometry)) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
        for (const [lon, lat] of ring) {
          expect(lon).toBeGreaterThan(120.85);
          expect(lon).toBeLessThan(121.2);
          expect(lat).toBeGreaterThan(14.3);
          expect(lat).toBeLessThan(14.8);
        }
      }
    }
  });
});
