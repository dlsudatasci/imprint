import { describe, it, expect } from "vitest";
import {
  IMPRINT_CITIES, TAXONOMY_18, validateImageRecord, validateImageRecords, prepareImageDocs,
} from "./imageImport.mjs";
import { normalizeCityName } from "@/util/cities";
import { TAXONOMY_CATEGORIES } from "@/util/taxonomy";

function makeRecord(overrides = {}) {
  return {
    imageID: 1,
    sourceImageId: "laspinas_frame_0001",
    imageName: "atlas3_laspinas_laspinas_frame_0001.jpg",
    url: null,
    city: "laspinas",
    source: "atlas3",
    annotationList: [{
      id: "atlas-0", comment: "car",
      mark: { x: 10, y: 20, width: 100, height: 50, type: "RECT" },
      selected: false, editable: false, isRejected: false,
    }],
    annotationCount: 0,
    isReference: false,
    poolStatus: "unserved",
    referenceGroundTruth: [],
    predictions: null,
    modelVersion: "v0-preannotation",
    width: 640,
    height: 360,
    ...overrides,
  };
}

describe("constants", () => {
  it("IMPRINT_CITIES are normalizeCityName() of the twelve study cities", () => {
    const names = ["Caloocan", "Las Piñas", "Makati", "Mandaluyong", "Manila", "Marikina",
      "Muntinlupa", "Parañaque", "Pasay", "Pasig", "Quezon City", "San Juan"];
    expect(new Set(names.map(normalizeCityName))).toEqual(IMPRINT_CITIES);
  });

  it("TAXONOMY_18 equals TAXONOMY_CATEGORIES", () => {
    expect(TAXONOMY_18).toEqual(new Set(TAXONOMY_CATEGORIES));
  });
});

describe("validateImageRecord", () => {
  it("accepts a valid record", () => {
    expect(validateImageRecord(makeRecord())).toEqual([]);
  });

  it("accepts a record with no boxes", () => {
    expect(validateImageRecord(makeRecord({ annotationList: [] }))).toEqual([]);
  });

  it("rejects an imageID beyond the safe integer range", () => {
    expect(validateImageRecord(makeRecord({ imageID: 2 ** 53 + 2 })).length).toBeGreaterThan(0);
  });

  it("rejects a string imageID", () => {
    expect(validateImageRecord(makeRecord({ imageID: "1" })).length).toBeGreaterThan(0);
  });

  it("rejects an imageName that does not match source, city and id", () => {
    expect(validateImageRecord(makeRecord({ imageName: "atlas3_las_pinas_laspinas_frame_0001.jpg" })).length).toBeGreaterThan(0);
  });

  it("rejects a city that is not a normalized study city", () => {
    expect(validateImageRecord(makeRecord({ city: "las_pinas", imageName: "atlas3_las_pinas_laspinas_frame_0001.jpg" })).length).toBeGreaterThan(0);
  });

  it("rejects a url that is already set", () => {
    expect(validateImageRecord(makeRecord({ url: "/corpus-images/x.jpg" })).length).toBeGreaterThan(0);
  });

  it("rejects a poolStatus other than unserved", () => {
    expect(validateImageRecord(makeRecord({ poolStatus: "served" })).length).toBeGreaterThan(0);
  });

  it("rejects an invalid modelVersion", () => {
    expect(validateImageRecord(makeRecord({ modelVersion: "preannotation" })).length).toBeGreaterThan(0);
  });

  it("rejects a box whose category is outside the taxonomy", () => {
    const r = makeRecord();
    r.annotationList[0].comment = "utility post";
    expect(validateImageRecord(r).join(" ")).toContain("not in taxonomy");
  });

  it("rejects a box that runs past the image edge", () => {
    const r = makeRecord();
    r.annotationList[0].mark.x = 600;
    expect(validateImageRecord(r).join(" ")).toContain("outside");
  });

  it("rejects a box with an unexpected key", () => {
    const r = makeRecord();
    r.annotationList[0].confidence = 0.9;
    expect(validateImageRecord(r).join(" ")).toContain("keys");
  });

  it("rejects an annotationList that is not an array", () => {
    expect(validateImageRecord(makeRecord({ annotationList: null })).join(" ")).toContain("annotationList must be an array");
  });

  it("rejects a box mark without type RECT", () => {
    const r = makeRecord();
    delete r.annotationList[0].mark.type;
    expect(validateImageRecord(r).join(" ")).toContain("type RECT");
  });

  it("rejects duplicate box ids within an image", () => {
    const r = makeRecord();
    r.annotationList.push({ ...r.annotationList[0], mark: { ...r.annotationList[0].mark } });
    expect(validateImageRecord(r).join(" ")).toContain("duplicate box id");
  });
});

describe("validateImageRecords", () => {
  it("reports duplicate imageIDs across records", () => {
    const a = makeRecord();
    const b = makeRecord({ sourceImageId: "laspinas_frame_0002", imageName: "atlas3_laspinas_laspinas_frame_0002.jpg" });
    const { problems } = validateImageRecords([a, b]);
    expect(problems.join(" ")).toContain("duplicate imageID 1");
  });

  it("reports duplicate imageNames across records", () => {
    const { problems } = validateImageRecords([makeRecord(), makeRecord({ imageID: 2 })]);
    expect(problems.join(" ")).toContain("duplicate imageName");
  });

  it("counts records by source and city, and boxes", () => {
    const b = makeRecord({ imageID: 2, source: "mapillary", city: "pasig", sourceImageId: "123", imageName: "mapillary_pasig_123.jpg", annotationList: [] });
    const { problems, counts } = validateImageRecords([makeRecord(), b]);
    expect(problems).toEqual([]);
    expect(counts).toEqual({ total: 2, bySource: { atlas3: 1, mapillary: 1 }, byCity: { laspinas: 1, pasig: 1 }, boxes: 1 });
  });

  it("rejects input that is not an array", () => {
    expect(validateImageRecords(null).problems.length).toBe(1);
  });
});

describe("prepareImageDocs", () => {
  it("sets url to prefix plus imageName without changing the input", () => {
    const input = [makeRecord()];
    const out = prepareImageDocs(input, "/corpus-images/");
    expect(out[0].url).toBe("/corpus-images/atlas3_laspinas_laspinas_frame_0001.jpg");
    expect(input[0].url).toBe(null);
  });

  it("rejects a prefix without a leading slash", () => {
    expect(() => prepareImageDocs([makeRecord()], "corpus-images/")).toThrow();
  });

  it("rejects a prefix without a trailing slash", () => {
    expect(() => prepareImageDocs([makeRecord()], "/corpus-images")).toThrow();
  });
});
