import { describe, it, expect } from "vitest";
import {
  RETRAINING_TAXONOMY,
  NOT_AN_OBJECT,
  RETRAINING_CSV_KEYS,
  pseudonymize,
  toCsvRow,
  writeCsv,
  buildRetrainingRows,
  isBelowMinimumSize,
  MODEL_COPY_SIZE,
  MIN_MODEL_AREA_PX,
} from "./retrainingExport.mjs";
import * as boxGeometry from "@/util/boxGeometry";
import { TAXONOMY_CATEGORIES } from "@/util/taxonomy";
import { NOT_AN_OBJECT as JUDGMENT_NOT_AN_OBJECT } from "@/util/suggestionJudgment";

function makeAnnotation(overrides = {}) {
  return {
    imageID: 1,
    userId: "user1",
    source: "contributor",
    servedModelVersion: "v0-mapillary",
    selectedObjectsID: [],
    newObjects: [],
    ...overrides,
  };
}

function makeBox(overrides = {}) {
  return {
    id: "box1",
    comment: "tree",
    obstructs: true,
    severity: 3,
    confidence: 0.85,
    mark: { x: 10, y: 20, width: 100, height: 200 },
    ...overrides,
  };
}

function makeUserMap(entries = {}) {
  const map = new Map();
  for (const [id, user] of Object.entries(entries)) {
    map.set(id, user);
  }
  return map;
}

function makeImageMap(entries = {}) {
  const map = new Map();
  for (const [id, img] of Object.entries(entries)) {
    map.set(Number(id), img);
  }
  return map;
}

describe("RETRAINING_TAXONOMY", () => {
  it("has exactly the 18 categories of TAXONOMY_CATEGORIES", () => {
    expect([...RETRAINING_TAXONOMY].sort()).toEqual([...TAXONOMY_CATEGORIES].sort());
    expect(RETRAINING_TAXONOMY.size).toBe(18);
  });
});

describe("NOT_AN_OBJECT", () => {
  it("equals the one exported by suggestionJudgment", () => {
    expect(NOT_AN_OBJECT).toBe(JUDGMENT_NOT_AN_OBJECT);
  });
});

describe("RETRAINING_CSV_KEYS", () => {
  it("contains the six demographic columns in order", () => {
    const demoKeys = [
      "userMobilityDisability", "userAgeGroup", "userCommuteFrequency",
      "userAccessibilityFamiliarity", "userWalkingFrequency", "userTemporaryMobility",
    ];
    const startIdx = RETRAINING_CSV_KEYS.indexOf("userMobilityDisability");
    expect(startIdx).toBeGreaterThan(-1);
    expect(RETRAINING_CSV_KEYS.slice(startIdx, startIdx + 6)).toEqual(demoKeys);
  });
});

describe("buildRetrainingRows", () => {
  it("exports annotator rows once annotators answer obstruction (Obstructions step, 4 Oct 2026)", () => {
    const keptAnsweredNo = makeBox({
      id: "s1", editable: false, selected: true, obstructs: false, severity: null,
      initialState: { comment: "tree", mark: { x: 5, y: 5, width: 90, height: 190 } },
    });
    const drawnAnsweredYes = makeBox({ id: "d1", editable: true, comment: "bollard", obstructs: true, severity: null, confidence: undefined });
    const annotations = [makeAnnotation({ source: "annotator", servedModelVersion: null, selectedObjectsID: [keptAnsweredNo], newObjects: [drawnAnsweredYes] })];
    const { rows, summary } = buildRetrainingRows({ annotations, userMap: makeUserMap(), imageMap: makeImageMap({ 1: { isReference: false } }) });

    expect(summary.excludedNoJudgment).toBe(0);
    expect(rows).toHaveLength(2);
    const kept = rows.find((r) => r.objectID === "s1");
    expect(kept).toMatchObject({ source: "annotator", obstructs: false, featureSource: "pipeline", isCreatedBox: false, boxW: 90 });
    const drawn = rows.find((r) => r.objectID === "d1");
    expect(drawn).toMatchObject({ source: "annotator", obstructs: true, featureSource: "created", isCreatedBox: true, category: "bollard" });
  });

  it("skips a box with no obstruction answer and counts it in excludedNoJudgment (4 Oct 2026)", () => {
    const annotations = [
      makeAnnotation({
        source: "annotator",
        selectedObjectsID: [makeBox({ id: "a", obstructs: null, severity: null })],
        newObjects: [makeBox({ id: "b", editable: true, obstructs: undefined }), makeBox({ id: "c", obstructs: false, severity: null })],
      }),
    ];
    const { rows, summary } = buildRetrainingRows({ annotations, userMap: makeUserMap(), imageMap: makeImageMap({ 1: { isReference: false } }) });
    expect(rows.map((r) => r.objectID)).toEqual(["c"]);
    expect(summary.excludedNoJudgment).toBe(2);
    expect(summary.rows).toBe(1);
  });

  it("starts excludedNoJudgment at zero when every box has an answer", () => {
    const annotations = [makeAnnotation({ selectedObjectsID: [makeBox()] })];
    const { summary } = buildRetrainingRows({ annotations, userMap: makeUserMap(), imageMap: makeImageMap({ 1: { isReference: false } }) });
    expect(summary.excludedNoJudgment).toBe(0);
    expect(summary.rows).toBe(1);
  });

  it("carries userWalkingFrequency and userTemporaryMobility from the user document", () => {
    const annotations = [makeAnnotation({ selectedObjectsID: [makeBox()] })];
    const userMap = makeUserMap({
      user1: {
        disability: "none", age: "25-34", commuteFrequency: "daily",
        accessibilityFamiliarity: "familiar", walkingFrequency: "daily",
        temporaryMobility: "none",
      },
    });
    const imageMap = makeImageMap({ 1: { isReference: false } });

    const { rows } = buildRetrainingRows({ annotations, userMap, imageMap });

    expect(rows).toHaveLength(1);
    expect(rows[0].userWalkingFrequency).toBe("daily");
    expect(rows[0].userTemporaryMobility).toBe("none");
  });

  it("gives empty strings for all six demographic columns when user is missing", () => {
    const annotations = [makeAnnotation({ selectedObjectsID: [makeBox()] })];
    const userMap = makeUserMap();
    const imageMap = makeImageMap({ 1: { isReference: false } });

    const { rows } = buildRetrainingRows({ annotations, userMap, imageMap });

    expect(rows[0].userMobilityDisability).toBe("");
    expect(rows[0].userAgeGroup).toBe("");
    expect(rows[0].userCommuteFrequency).toBe("");
    expect(rows[0].userAccessibilityFamiliarity).toBe("");
    expect(rows[0].userWalkingFrequency).toBe("");
    expect(rows[0].userTemporaryMobility).toBe("");
  });

  it("excludes annotations on reference images and counts them", () => {
    const annotations = [makeAnnotation({ selectedObjectsID: [makeBox()] })];
    const userMap = makeUserMap();
    const imageMap = makeImageMap({ 1: { isReference: true } });

    const { rows, summary } = buildRetrainingRows({ annotations, userMap, imageMap });

    expect(rows).toHaveLength(0);
    expect(summary.excludedReferenceAnnotations).toBe(1);
  });

  it("uses initialState for feature columns on a relabeled/moved suggestion", () => {
    const box = makeBox({
      comment: "bollard",
      mark: { x: 50, y: 60, width: 150, height: 250 },
      initialState: {
        comment: "tree",
        mark: { x: 10, y: 20, width: 100, height: 200 },
      },
      editable: false,
    });
    const annotations = [makeAnnotation({ selectedObjectsID: [box] })];
    const userMap = makeUserMap();
    const imageMap = makeImageMap({ 1: { isReference: false } });

    const { rows } = buildRetrainingRows({ annotations, userMap, imageMap });

    expect(rows).toHaveLength(1);
    expect(rows[0].featureSource).toBe("pipeline");
    expect(rows[0].category).toBe("tree");
    expect(rows[0].boxX).toBe(10);
    expect(rows[0].boxY).toBe(20);
    expect(rows[0].boxW).toBe(100);
    expect(rows[0].boxH).toBe(200);
    expect(rows[0].finalCategory).toBe("bollard");
    expect(rows[0].finalBoxX).toBe(50);
    expect(rows[0].finalBoxY).toBe(60);
    expect(rows[0].finalBoxW).toBe(150);
    expect(rows[0].finalBoxH).toBe(250);
  });

  it("uses final values with final_fallback when suggestion has no initialState", () => {
    const box = makeBox({ editable: false });
    const annotations = [makeAnnotation({ selectedObjectsID: [box] })];
    const userMap = makeUserMap();
    const imageMap = makeImageMap({ 1: { isReference: false } });

    const { rows, summary } = buildRetrainingRows({ annotations, userMap, imageMap });

    expect(rows).toHaveLength(1);
    expect(rows[0].featureSource).toBe("final_fallback");
    expect(rows[0].category).toBe("tree");
    expect(summary.fallbackRows).toBe(1);
  });

  it("sets isCreatedBox true and featureSource created for drawn boxes", () => {
    const box = makeBox({ editable: true, id: "created1" });
    const annotations = [makeAnnotation({ newObjects: [box] })];
    const userMap = makeUserMap();
    const imageMap = makeImageMap({ 1: { isReference: false } });

    const { rows, summary } = buildRetrainingRows({ annotations, userMap, imageMap });

    expect(rows).toHaveLength(1);
    expect(rows[0].isCreatedBox).toBe(true);
    expect(rows[0].featureSource).toBe("created");
    expect(rows[0].category).toBe("tree");
    expect(rows[0].boxX).toBe(10);
    expect(summary.createdBoxRows).toBe(1);
  });

  it("excludes a box whose final comment is not_an_object and counts it", () => {
    const box = makeBox({ comment: "not_an_object" });
    const annotations = [makeAnnotation({ selectedObjectsID: [box] })];
    const userMap = makeUserMap();
    const imageMap = makeImageMap({ 1: { isReference: false } });

    const { rows, summary } = buildRetrainingRows({ annotations, userMap, imageMap });

    expect(rows).toHaveLength(0);
    expect(summary.excludedNotAnObject).toBe(1);
  });

  it("excludes a box whose final comment is free text and counts it", () => {
    const box = makeBox({ comment: "random stuff" });
    const annotations = [makeAnnotation({ selectedObjectsID: [box] })];
    const userMap = makeUserMap();
    const imageMap = makeImageMap({ 1: { isReference: false } });

    const { rows, summary } = buildRetrainingRows({ annotations, userMap, imageMap });

    expect(rows).toHaveLength(0);
    expect(summary.excludedFreeText).toBe(1);
  });

  it("excludes a suggestion whose initialState.comment is outside the taxonomy", () => {
    const box = makeBox({
      comment: "bollard",
      editable: false,
      initialState: { comment: "utility post", mark: { x: 1, y: 2, width: 3, height: 4 } },
    });
    const annotations = [makeAnnotation({ selectedObjectsID: [box] })];
    const userMap = makeUserMap();
    const imageMap = makeImageMap({ 1: { isReference: false } });

    const { rows, summary } = buildRetrainingRows({ annotations, userMap, imageMap });

    expect(rows).toHaveLength(0);
    expect(summary.excludedNonTaxonomyFeatureCategory).toBe(1);
  });

  it("sets severity to empty when obstructs is false", () => {
    const box = makeBox({ obstructs: false, severity: 5 });
    const annotations = [makeAnnotation({ selectedObjectsID: [box] })];
    const userMap = makeUserMap();
    const imageMap = makeImageMap({ 1: { isReference: false } });

    const { rows } = buildRetrainingRows({ annotations, userMap, imageMap });

    expect(rows[0].obstructs).toBe(false);
    expect(rows[0].severity).toBe("");
  });

  it("sets severity when obstructs is true", () => {
    const box = makeBox({ obstructs: true, severity: 4 });
    const annotations = [makeAnnotation({ selectedObjectsID: [box] })];
    const userMap = makeUserMap();
    const imageMap = makeImageMap({ 1: { isReference: false } });

    const { rows } = buildRetrainingRows({ annotations, userMap, imageMap });

    expect(rows[0].obstructs).toBe(true);
    expect(rows[0].severity).toBe(4);
  });

  it("produces identical objectKey for the same suggestion across two users", () => {
    const sharedBox = { id: "sugg42", comment: "tree", obstructs: true, severity: 2, mark: { x: 1, y: 2, width: 3, height: 4 } };
    const annotations = [
      makeAnnotation({ userId: "userA", selectedObjectsID: [{ ...sharedBox }] }),
      makeAnnotation({ userId: "userB", selectedObjectsID: [{ ...sharedBox }] }),
    ];
    const userMap = makeUserMap();
    const imageMap = makeImageMap({ 1: { isReference: false } });

    const { rows } = buildRetrainingRows({ annotations, userMap, imageMap });

    expect(rows).toHaveLength(2);
    expect(rows[0].objectKey).toBe("1:sugg42");
    expect(rows[1].objectKey).toBe("1:sugg42");
    expect(rows[0].objectKey).toBe(rows[1].objectKey);
  });

  it("defaults source to contributor and passes annotator through", () => {
    const box = makeBox();
    const annotations = [
      makeAnnotation({ source: undefined, selectedObjectsID: [{ ...box, id: "b1" }] }),
      makeAnnotation({ source: "annotator", selectedObjectsID: [{ ...box, id: "b2" }] }),
    ];
    const userMap = makeUserMap();
    const imageMap = makeImageMap({ 1: { isReference: false } });

    const { rows } = buildRetrainingRows({ annotations, userMap, imageMap });

    expect(rows[0].source).toBe("contributor");
    expect(rows[1].source).toBe("annotator");
  });

  it("passes servedModelVersion and confidence through, with empty when absent", () => {
    const box1 = makeBox({ confidence: 0.9, id: "b1" });
    const box2 = makeBox({ confidence: undefined, id: "b2" });
    const annotations = [
      makeAnnotation({ servedModelVersion: "v1-det", selectedObjectsID: [box1] }),
      makeAnnotation({ servedModelVersion: undefined, selectedObjectsID: [box2] }),
    ];
    const userMap = makeUserMap();
    const imageMap = makeImageMap({ 1: { isReference: false } });

    const { rows } = buildRetrainingRows({ annotations, userMap, imageMap });

    expect(rows[0].servedModelVersion).toBe("v1-det");
    expect(rows[0].confidence).toBe(0.9);
    expect(rows[1].servedModelVersion).toBe("");
    expect(rows[1].confidence).toBe("");
  });
});

describe("pseudonymize", () => {
  it("returns 16 hex characters, is stable, and differs between users", () => {
    const a = pseudonymize("user1");
    const b = pseudonymize("user2");

    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).toBe(pseudonymize("user1"));
    expect(a).not.toBe(b);
  });
});

describe("toCsvRow", () => {
  it("quotes values containing commas, quotes or newlines and doubles embedded quotes", () => {
    const keys = ["a", "b", "c", "d"];
    const obj = { a: "hello, world", b: 'say "hi"', c: "line1\nline2", d: "plain" };
    const row = toCsvRow(obj, keys);

    expect(row).toBe('"hello, world","say ""hi""","line1\nline2",plain');
  });
});

describe("writeCsv", () => {
  it("writes the header row first and ends with a newline", () => {
    const keys = ["x", "y"];
    const rows = [{ x: 1, y: 2 }];
    const csv = writeCsv(rows, keys);

    expect(csv.startsWith("x,y\n")).toBe(true);
    expect(csv.endsWith("\n")).toBe(true);
    expect(csv).toBe("x,y\n1,2\n");
  });
});

// Boxes under about 20 by 20 pixels are kept in the data but left out of the
// export (6 Oct 2026)
describe("minimum box size in the retraining export", () => {
  const MAPILLARY = { isReference: false, width: 1280, height: 960 };
  const ATLAS = { isReference: false, width: 640, height: 360 };
  const rowsFor = (boxes, image, source = "annotator") => buildRetrainingRows({
    annotations: [makeAnnotation({ source, selectedObjectsID: boxes })],
    userMap: makeUserMap(),
    imageMap: makeImageMap({ 1: image }),
  });
  const sized = (id, width, height, extra = {}) => makeBox({ id, mark: { x: 10, y: 10, width, height }, ...extra });

  it("uses the same rule as src/util/boxGeometry.js", () => {
    expect(MODEL_COPY_SIZE).toBe(boxGeometry.MODEL_COPY_SIZE);
    expect(MIN_MODEL_AREA_PX).toBe(boxGeometry.MIN_MODEL_AREA_PX);
    const samples = [
      [{ width: 40, height: 40 }, 1280, 960], [{ width: 39, height: 40 }, 1280, 960],
      [{ width: 20, height: 20 }, 640, 360], [{ width: 19, height: 20 }, 640, 360],
      [{ width: 8, height: 60 }, 640, 360], [{ width: -19, height: 20 }, 640, 360],
      [{ width: 1, height: 1 }, undefined, undefined],
    ];
    for (const [mark, w, h] of samples) {
      expect(isBelowMinimumSize(mark, w, h)).toBe(boxGeometry.isBelowMinimumSize(mark, w, h));
    }
  });

  it("leaves out a box under 400 square pixels in the model copy and counts it", () => {
    const { rows, summary } = rowsFor([sized("big", 40, 40), sized("small", 39, 40)], MAPILLARY);
    expect(rows.map((r) => r.objectID)).toEqual(["big"]);
    expect(summary.excludedBelowMinimumSize).toBe(1);
  });

  it("keeps a thin pole, since the minimum is an area", () => {
    const { rows, summary } = rowsFor([sized("pole", 8, 60)], ATLAS);
    expect(rows).toHaveLength(1);
    expect(summary.excludedBelowMinimumSize).toBe(0);
  });

  it("measures the box as finally drawn or kept, not the pipeline's original", () => {
    const shrunk = sized("s1", 10, 10, { initialState: { comment: "tree", mark: { x: 0, y: 0, width: 100, height: 100 } } });
    const { rows, summary } = rowsFor([shrunk], ATLAS);
    expect(rows).toEqual([]);
    expect(summary.excludedBelowMinimumSize).toBe(1);
  });

  it("applies to drawn boxes and to contributors as well", () => {
    const drawnTiny = sized("d1", 12, 12, { editable: true });
    expect(rowsFor([drawnTiny], ATLAS).summary.excludedBelowMinimumSize).toBe(1);
    expect(rowsFor([sized("c1", 12, 12)], ATLAS, "contributor").summary.excludedBelowMinimumSize).toBe(1);
  });

  it("keeps the box when the image size is unknown", () => {
    const { rows, summary } = rowsFor([sized("small", 5, 5)], { isReference: false });
    expect(rows).toHaveLength(1);
    expect(summary.excludedBelowMinimumSize).toBe(0);
  });

  it("starts the count at zero", () => {
    expect(rowsFor([sized("big", 100, 100)], MAPILLARY).summary.excludedBelowMinimumSize).toBe(0);
  });
});
