import { describe, it, expect } from "vitest";
import {
  ALLOWED_SESSION_SIZES,
  ANNOTATOR_SESSION_SIZES,
  ensureModelVersion,
  calculateReferenceCount,
  canServeImage,
  REFERENCE_RATE,
  REFERENCE_MATCH,
  ANNOTATOR_MODEL_DEV_MATCH,
  CONTRIBUTOR_DEPLOYMENT_MATCH,
  toClientImage,
  annotatorModelDevFirst,
} from "./annotationGet.js";

describe("session size constants", () => {
  it("contributor sizes are [5, 10, 20, 40]", () => {
    expect(ALLOWED_SESSION_SIZES).toEqual([5, 10, 20, 40]);
  });

  it("annotator sizes are [10, 25, 50]", () => {
    expect(ANNOTATOR_SESSION_SIZES).toEqual([10, 25, 50]);
  });

  it("rejects invalid contributor size", () => {
    expect(ALLOWED_SESSION_SIZES.includes(15)).toBe(false);
    expect(ALLOWED_SESSION_SIZES.includes(80)).toBe(false);
  });

  it("rejects invalid annotator size", () => {
    expect(ANNOTATOR_SESSION_SIZES.includes(5)).toBe(false);
    expect(ANNOTATOR_SESSION_SIZES.includes(100)).toBe(false);
  });
});

describe("ensureModelVersion", () => {
  it("fills missing modelVersion with v0-mapillary", () => {
    const records = [{ imageID: 1 }, { imageID: 2 }];
    ensureModelVersion(records);
    expect(records[0].modelVersion).toBe("v0-mapillary");
    expect(records[1].modelVersion).toBe("v0-mapillary");
  });

  it("preserves existing modelVersion", () => {
    const records = [{ imageID: 1, modelVersion: "v1-custom" }];
    ensureModelVersion(records);
    expect(records[0].modelVersion).toBe("v1-custom");
  });

  it("handles mixed records", () => {
    const records = [
      { imageID: 1, modelVersion: "v1-custom" },
      { imageID: 2 },
    ];
    ensureModelVersion(records);
    expect(records[0].modelVersion).toBe("v1-custom");
    expect(records[1].modelVersion).toBe("v0-mapillary");
  });

  it("handles empty array", () => {
    const records = [];
    ensureModelVersion(records);
    expect(records).toEqual([]);
  });
});

describe("calculateReferenceCount", () => {
  it("uses a rate of one in eight", () => {
    expect(REFERENCE_RATE).toBe(8);
  });

  it("gives a first session round(size / 8) reference images", () => {
    expect(calculateReferenceCount(5, 0)).toBe(1);
    expect(calculateReferenceCount(10, 0)).toBe(1);
    expect(calculateReferenceCount(20, 0)).toBe(3);
    expect(calculateReferenceCount(40, 0)).toBe(5);
  });

  it("defaults priorServed to 0", () => {
    expect(calculateReferenceCount(40)).toBe(calculateReferenceCount(40, 0));
  });

  it("can give a short session none when earlier sessions already carried its share", () => {
    // 5 served before: round(5/8) = 1 already given; round(10/8) = 1, so none now
    expect(calculateReferenceCount(5, 5)).toBe(0);
    // 20 served before: round(20/8) = 3; round(25/8) = 3
    expect(calculateReferenceCount(5, 20)).toBe(0);
  });

  it("keeps the running total within half an image of one in eight for any mix of sizes", () => {
    const sizes = [5, 10, 20, 40, 5, 5, 20, 10, 40, 5, 10, 5, 20, 40, 40, 5];
    let served = 0;
    let refs = 0;
    for (const size of sizes) {
      refs += calculateReferenceCount(size, served);
      served += size;
      expect(Math.abs(refs - served / 8)).toBeLessThanOrEqual(0.5);
    }
  });

  it("gives 1 in 8 exactly over a run of 5-image sessions", () => {
    let served = 0;
    let refs = 0;
    for (let i = 0; i < 64; i++) {
      refs += calculateReferenceCount(5, served);
      served += 5;
    }
    expect(served).toBe(320);
    expect(refs).toBe(40);
  });

  it("never returns a negative count or more than the session size", () => {
    for (const size of [5, 10, 20, 40]) {
      for (let prior = 0; prior < 200; prior++) {
        const n = calculateReferenceCount(size, prior);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(size);
      }
    }
  });

  it("treats invalid inputs as zero", () => {
    expect(calculateReferenceCount(0, 0)).toBe(0);
    expect(calculateReferenceCount(-5, 0)).toBe(0);
    expect(calculateReferenceCount(10, -3)).toBe(calculateReferenceCount(10, 0));
    expect(calculateReferenceCount(10, 2.5)).toBe(calculateReferenceCount(10, 0));
    expect(calculateReferenceCount("10", 0)).toBe(0);
  });
});

describe("pool match filters", () => {
  it("reference images are served reference images", () => {
    expect(REFERENCE_MATCH).toEqual({ isReference: true, poolStatus: "served" });
  });

  it("annotators draw non-reference images only from the model-dev pool", () => {
    expect(ANNOTATOR_MODEL_DEV_MATCH).toEqual({ isReference: { $ne: true }, poolStatus: "model_dev" });
  });

  it("contributors draw non-reference images only from the served pool", () => {
    expect(CONTRIBUTOR_DEPLOYMENT_MATCH).toEqual({ isReference: false, poolStatus: "served" });
  });

  it("the annotator and contributor pools cannot overlap", () => {
    expect(ANNOTATOR_MODEL_DEV_MATCH.poolStatus).not.toBe(CONTRIBUTOR_DEPLOYMENT_MATCH.poolStatus);
  });
});

describe("canServeImage", () => {
  const reference = { isReference: true, poolStatus: "served" };
  const modelDev = { isReference: false, poolStatus: "model_dev" };
  const deployment = { isReference: false, poolStatus: "served" };
  const reserve = { isReference: false, poolStatus: "reserve" };
  const unserved = { isReference: false, poolStatus: "unserved" };

  it("serves reference images to both annotators and contributors", () => {
    expect(canServeImage(reference, true)).toBe(true);
    expect(canServeImage(reference, false)).toBe(true);
  });

  it("never serves a model-dev image to a contributor", () => {
    expect(canServeImage(modelDev, false)).toBe(false);
  });

  it("serves model-dev images to annotators", () => {
    expect(canServeImage(modelDev, true)).toBe(true);
  });

  it("never serves a deployment image to an annotator", () => {
    expect(canServeImage(deployment, true)).toBe(false);
  });

  it("serves deployment images to contributors", () => {
    expect(canServeImage(deployment, false)).toBe(true);
  });

  it("serves reserve and unserved images to nobody", () => {
    for (const img of [reserve, unserved]) {
      expect(canServeImage(img, true)).toBe(false);
      expect(canServeImage(img, false)).toBe(false);
    }
  });

  it("does not serve a reference image that is not in the served pool", () => {
    expect(canServeImage({ isReference: true, poolStatus: "reserve" }, false)).toBe(false);
    expect(canServeImage({ isReference: true, poolStatus: "model_dev" }, true)).toBe(false);
  });

  it("does not serve records with a missing status or reference flag", () => {
    expect(canServeImage({ poolStatus: "served" }, false)).toBe(false);
    expect(canServeImage({ isReference: false }, false)).toBe(false);
    expect(canServeImage({ isReference: false }, true)).toBe(false);
    expect(canServeImage(null, false)).toBe(false);
    expect(canServeImage(undefined, true)).toBe(false);
  });
});

// Reference answers stay on the server (6 Oct 2026, both roles)
describe("toClientImage", () => {
  const image = {
    _id: "i1",
    imageID: 7,
    url: "/corpus-images/a.jpg",
    isReference: true,
    annotationList: [{ id: "p1" }],
    referenceGroundTruth: [{ userId: "a1", source: "annotator", newObjects: [] }],
  };

  it("removes referenceGroundTruth and keeps every other field", () => {
    const out = toClientImage(image);
    expect(out).not.toHaveProperty("referenceGroundTruth");
    expect(out).toEqual({ _id: "i1", imageID: 7, url: "/corpus-images/a.jpg", isReference: true, annotationList: [{ id: "p1" }] });
  });

  it("does not mutate its input", () => {
    const original = structuredClone(image);
    toClientImage(image);
    expect(image).toEqual(original);
  });

  it("passes an image without reference answers through as a copy, and a missing image as it is", () => {
    const plain = { imageID: 8, url: "x" };
    expect(toClientImage(plain)).toEqual(plain);
    expect(toClientImage(plain)).not.toBe(plain);
    expect(toClientImage(null)).toBeNull();
  });
});

// Local testing only (6 Oct 2026)
describe("annotatorModelDevFirst", () => {
  it("is on only when ANNOTATOR_MODEL_DEV_FIRST is \"true\" outside production", () => {
    expect(annotatorModelDevFirst({ NODE_ENV: "development", ANNOTATOR_MODEL_DEV_FIRST: "true" })).toBe(true);
    expect(annotatorModelDevFirst({ NODE_ENV: "test", ANNOTATOR_MODEL_DEV_FIRST: "true" })).toBe(true);
  });

  it("is never on in a production build, so the live study order cannot change", () => {
    expect(annotatorModelDevFirst({ NODE_ENV: "production", ANNOTATOR_MODEL_DEV_FIRST: "true" })).toBe(false);
  });

  it("is off when the setting is missing or anything other than \"true\"", () => {
    for (const value of [undefined, "", "1", "yes", "TRUE", "false"]) {
      expect(annotatorModelDevFirst({ NODE_ENV: "development", ANNOTATOR_MODEL_DEV_FIRST: value })).toBe(false);
    }
  });
});
