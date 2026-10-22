import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { SESSION_EVENTS, ownedFilter, annotationCountReversal, decrementCount } from "./sessionCleanup.mjs";

// scripts/remove-admin-sessions.mjs (22 Oct 2026)
describe("annotationCountReversal", () => {
  it("takes back what each kind of session added: every photo of a finished one, the finished photos of a stopped one, nothing for an active one", () => {
    const a = new ObjectId();
    const b = new ObjectId();
    const { byId, byImageID } = annotationCountReversal([
      { status: "completed", imageIDs: [a, b] },
      { status: "completed", imageIDs: [a] },
      { status: "abandoned", completedImageIDs: [7, 8], imageIDs: [new ObjectId()] },
      { status: "active", imageIDs: [b], completedImageIDs: [9] },
    ]);
    expect(byId).toEqual([[a, 2], [b, 1]]);
    expect(byImageID).toEqual([[7, 1], [8, 1]]);
  });

  it("is empty for no sessions", () => {
    expect(annotationCountReversal([])).toEqual({ byId: [], byImageID: [] });
    expect(annotationCountReversal()).toEqual({ byId: [], byImageID: [] });
  });
});

describe("decrementCount", () => {
  it("never takes a count below 0", () => {
    expect(decrementCount({ imageID: 7 }, 2)).toEqual({
      updateOne: {
        filter: { imageID: 7 },
        update: [{ $set: { annotationCount: { $max: [0, { $subtract: [{ $ifNull: ["$annotationCount", 0] }, 2] }] } } }],
      },
    });
  });
});

describe("what is removed", () => {
  it("finds the account's records by its id as text or ObjectId, or its username", () => {
    const id = new ObjectId();
    const filter = ownedFilter({ _id: id, username: "admin" }, ObjectId);
    expect(filter.$or[0].userId.$in.map(String)).toEqual([String(id), String(id)]);
    expect(filter.$or[1]).toEqual({ username: "admin" });
  });

  it("removes session telemetry only, keeping the admin's own actions", () => {
    expect(SESSION_EVENTS).toContain("IMAGE_SUBMITTED");
    for (const kept of ["ROLE_CHANGED", "ACCOUNT_DELETED", "MODEL_PREDICTIONS_UPDATED"]) expect(SESSION_EVENTS).not.toContain(kept);
  });
});
