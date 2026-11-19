import { describe, it, expect } from "vitest";
import { SESSION_CHANGED_CODES, isSessionChanged, batchIds, sameBatch, cachedSessionCheck, batchModelVersions } from "./sessionSync";
import { DEFAULT_MODEL_VERSION } from "./annotationGet";

// 23 Oct 2026: a phone left overnight held a copy of a session that was no longer current
const batch = (...ids) => ({ imgRecords: ids.map((_id, i) => ({ _id, imageID: i + 1 })) });

describe("sameBatch", () => {
  it("is the same images in the same order", () => {
    expect(sameBatch(batch("a", "b"), batch("a", "b"))).toBe(true);
    expect(sameBatch(batch("a", "b"), batch("b", "a"))).toBe(false);
    expect(sameBatch(batch("a", "b"), batch("a", "b", "c"))).toBe(false);
  });

  it("compares ids as text, so a cached string matches a server ObjectId's", () => {
    const objectIdLike = { toString: () => "a" };
    expect(sameBatch(batch("a"), { imgRecords: [{ _id: objectIdLike }] })).toBe(true);
    expect(batchIds(batch("a", "b"))).toEqual(["a", "b"]);
  });

  it("is never the same when there is nothing to compare", () => {
    expect(sameBatch(batch(), batch())).toBe(false);
    expect(sameBatch(null, batch("a"))).toBe(false);
    expect(sameBatch({ imgRecords: [{}] }, { imgRecords: [{}] })).toBe(false);
  });
});

describe("cachedSessionCheck", () => {
  const cached = batch("a", "b");

  it("keeps the saved copy of the account's current session", () => {
    expect(cachedSessionCheck(cached, { isExistingSession: true, ...batch("a", "b") })).toBe("keep");
  });

  it("replaces it when another session is active", () => {
    expect(cachedSessionCheck(cached, { isExistingSession: true, ...batch("c", "d") })).toBe("replace");
    // The tutorial's practice photos have no session at all
    expect(cachedSessionCheck({ imgRecords: [{ imageID: 1 }] }, { isExistingSession: true, ...batch("a") })).toBe("replace");
  });

  it("clears it when nothing is active any more", () => {
    expect(cachedSessionCheck(cached, { imgRecords: [], sessionSizes: [10, 25, 50] })).toBe("clear");
    expect(cachedSessionCheck(cached, { isExistingSession: true, imgRecords: [] })).toBe("clear");
  });

  it("keeps it when the server could not be asked", () => {
    expect(cachedSessionCheck(cached, null)).toBe("keep");
    expect(cachedSessionCheck(cached, { error: "User not found" })).toBe("keep");
  });
});

// S34 (19 Nov 2026): a session left open across a prediction update
describe("cachedSessionCheck after a prediction update", () => {
  const versioned = (...pairs) => ({ imgRecords: pairs.map(([_id, modelVersion], i) => ({ _id, imageID: i + 1, ...(modelVersion ? { modelVersion } : {}) })) });
  const server = (...pairs) => ({ isExistingSession: true, ...versioned(...pairs) });

  it("keeps the same batch with the same model versions", () => {
    expect(cachedSessionCheck(versioned(["a", "v1-xgboost"], ["b", "v1-xgboost"]), server(["a", "v1-xgboost"], ["b", "v1-xgboost"]))).toBe("keep");
  });

  it("replaces the same batch when one photo's model version changed", () => {
    expect(cachedSessionCheck(versioned(["a", "v1-xgboost"], ["b", "v1-xgboost"]), server(["a", "v1-xgboost"], ["b", "v2-xgboost"]))).toBe("replace");
  });

  it("compares a cached photo with no modelVersion as the default model", () => {
    expect(cachedSessionCheck(versioned(["a"], ["b"]), server(["a", DEFAULT_MODEL_VERSION], ["b", DEFAULT_MODEL_VERSION]))).toBe("keep");
    expect(cachedSessionCheck(versioned(["a"], ["b"]), server(["a", DEFAULT_MODEL_VERSION], ["b", "v1-xgboost"]))).toBe("replace");
    expect(batchModelVersions(versioned(["a"]))).toEqual(new Map([["a", DEFAULT_MODEL_VERSION]]));
  });

  it("matches photos by _id as text", () => {
    const objectIdLike = { toString: () => "a" };
    const fromServer = { isExistingSession: true, imgRecords: [{ _id: objectIdLike, modelVersion: "v2-xgboost" }] };
    expect(cachedSessionCheck(versioned(["a", "v1-xgboost"]), fromServer)).toBe("replace");
  });
});

describe("isSessionChanged", () => {
  it("reads the codes annotationSubmit sends", () => {
    expect(isSessionChanged({ code: SESSION_CHANGED_CODES.noSession })).toBe(true);
    expect(isSessionChanged({ code: SESSION_CHANGED_CODES.otherSession })).toBe(true);
    // S34: the photo's suggestions were updated after the page loaded them
    expect(SESSION_CHANGED_CODES.modelUpdated).toBe("MODEL_UPDATED");
    expect(isSessionChanged({ code: "MODEL_UPDATED" })).toBe(true);
    expect(isSessionChanged({ message: "Invalid sidewalk width value." })).toBe(false);
    expect(isSessionChanged(null)).toBe(false);
  });
});
