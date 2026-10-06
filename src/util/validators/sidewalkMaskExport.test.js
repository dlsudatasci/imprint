import { describe, it, expect } from "vitest";
import { buildSidewalkMaskRows, toJsonl } from "./sidewalkMaskExport.mjs";
import { pseudonymize } from "./retrainingExport.mjs";

const polygons = [{ id: "w1", kind: "walk", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }] }];
const DATE = new Date("2026-10-06T08:30:00.000Z");
const ann = (imageID, extra = {}) => ({
  imageID,
  userId: "u1",
  source: "annotator",
  status: "completed",
  date: DATE,
  sidewalkMask: { noSidewalk: false, polygons },
  ...extra,
});
const imageMap = new Map([
  [1, { imageID: 1, imageName: "a.jpg", city: "makati", width: 1280, height: 960, letterbox: { scale: 0.5 }, isReference: false }],
  [2, { imageID: 2, imageName: "b.jpg", city: "manila", width: 640, height: 360, isReference: false }],
  [3, { imageID: 3, imageName: "ref.jpg", city: "manila", width: 640, height: 360, isReference: true }],
  [4, { imageID: 4, imageName: "agree.jpg", city: "pasig", width: 640, height: 360, isReference: true, sidewalkAgreement: true }],
  [5, { imageID: 5, imageName: "agree2.jpg", city: "pasig", width: 640, height: 360, isReference: true, sidewalkAgreement: true }],
]);

describe("buildSidewalkMaskRows (6 Oct 2026)", () => {
  it("writes one row per completed annotator outline on a model-development image", () => {
    const { rows, summary } = buildSidewalkMaskRows({ annotations: [ann(1)], imageMap });
    expect(rows).toEqual([{
      imageID: 1,
      imageName: "a.jpg",
      source: "annotator",
      city: "makati",
      width: 1280,
      height: 960,
      letterbox: { scale: 0.5 },
      pseudoUserId: pseudonymize("u1"),
      date: "2026-10-06T08:30:00.000Z",
      noSidewalk: false,
      polygons,
    }]);
    expect(rows[0].polygons).toBe(polygons);
    expect(summary).toEqual({
      rows: 1, noSidewalkRows: 0, agreementRows: 0, agreementNoSidewalkRows: 0, excludedReference: 0, excludedMissingImage: 0,
    });
  });

  it("counts No sidewalk rows", () => {
    const { rows, summary } = buildSidewalkMaskRows({
      annotations: [ann(1), ann(2, { sidewalkMask: { noSidewalk: true, polygons: [] } })],
      imageMap,
    });
    expect(rows[1]).toMatchObject({ imageID: 2, noSidewalk: true, polygons: [] });
    expect(summary.noSidewalkRows).toBe(1);
  });

  it("excludes and counts reference images and images with no record", () => {
    const { rows, summary } = buildSidewalkMaskRows({ annotations: [ann(3), ann(99), ann(1)], imageMap });
    expect(rows.map((r) => r.imageID)).toEqual([1]);
    expect(summary).toMatchObject({ rows: 1, excludedReference: 1, excludedMissingImage: 1 });
  });

  it("skips contributor, unfinished and mask-less annotations", () => {
    const { rows } = buildSidewalkMaskRows({
      annotations: [ann(1, { source: "contributor" }), ann(1, { status: "pending" }), ann(1, { sidewalkMask: null })],
      imageMap,
    });
    expect(rows).toEqual([]);
  });

  it("puts outlines on flagged reference images in agreementRows, not rows (6 Oct 2026)", () => {
    const { rows, agreementRows, summary } = buildSidewalkMaskRows({
      annotations: [ann(1), ann(4), ann(5, { sidewalkMask: { noSidewalk: true, polygons: [] } })],
      imageMap,
    });
    expect(rows.map((r) => r.imageID)).toEqual([1]);
    expect(agreementRows.map((r) => r.imageID)).toEqual([4, 5]);
    expect(agreementRows[0]).toMatchObject({ imageName: "agree.jpg", city: "pasig", pseudoUserId: pseudonymize("u1"), noSidewalk: false, polygons });
    expect(summary).toMatchObject({ rows: 1, agreementRows: 2, agreementNoSidewalkRows: 1, noSidewalkRows: 0, excludedReference: 0 });
  });

  it("still excludes an outline on an unflagged reference image", () => {
    const { rows, agreementRows, summary } = buildSidewalkMaskRows({ annotations: [ann(3)], imageMap });
    expect(rows).toEqual([]);
    expect(agreementRows).toEqual([]);
    expect(summary.excludedReference).toBe(1);
  });

  it("gives date as an ISO string in both lists, or null when missing or invalid", () => {
    const { rows, agreementRows } = buildSidewalkMaskRows({
      annotations: [ann(1), ann(2, { date: undefined }), ann(4, { date: "2026-10-05T01:02:03Z" }), ann(5, { date: "not a date" })],
      imageMap,
    });
    expect(rows.map((r) => r.date)).toEqual(["2026-10-06T08:30:00.000Z", null]);
    expect(agreementRows.map((r) => r.date)).toEqual(["2026-10-05T01:02:03.000Z", null]);
  });

  it("writes one JSON object per line", () => {
    const { rows } = buildSidewalkMaskRows({ annotations: [ann(1), ann(2)], imageMap });
    const lines = toJsonl(rows).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).imageID).toBe(2);
    expect(toJsonl([])).toBe("");
  });
});
