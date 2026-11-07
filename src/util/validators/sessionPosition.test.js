import { describe, it, expect } from "vitest";
import { capPosition, completedCount, sessionTotal, wasSent } from "./sessionPosition";
import { leaveAction } from "@/util/imageNavigation";
import { reachedCountOf } from "./annotationGet";

// S20 (7 Nov 2026): the server never stores a position past the next unfinished photo
describe("capPosition", () => {
  const session = { total: 10, completedCount: 6 };

  it("clamps a position past the next unfinished photo to it", () => {
    for (const n of [8, 10, 11, 99]) expect(capPosition(n, session)).toBe(7);
  });

  it("passes 0 and every position up to the next unfinished photo unchanged", () => {
    for (const n of [0, 1, 4, 6, 7]) expect(capPosition(n, session)).toBe(n);
  });

  it("allows the finished screen, one past the last photo, only once every photo is sent", () => {
    expect(capPosition(11, { total: 10, completedCount: 10 })).toBe(11);
    expect(capPosition(12, { total: 10, completedCount: 10 })).toBe(11);
    expect(capPosition(11, { total: 10, completedCount: 9 })).toBe(10);
  });

  it("caps by the photos sent alone when the session's size is unknown", () => {
    expect(capPosition(9, { total: 0, completedCount: 3 })).toBe(4);
    expect(capPosition(9, { total: undefined, completedCount: undefined })).toBe(1);
  });

  it("never changes what the client sends going back and forward (imageNavigation's leaveAction)", () => {
    // Every target leaveAction lets the strip or Previous open, from every image, in a 5-photo session
    for (let sent = 0; sent <= 5; sent++) {
      const reached = Math.min(5, sent + 1);
      for (let current = 1; current <= reached; current++) {
        for (let target = 1; target <= 5; target++) {
          const action = leaveAction({ current, target, reached, total: 5, changed: false });
          if (action === "go") expect(capPosition(target, { total: 5, completedCount: sent })).toBe(target);
        }
        // Next Image from the image on screen, which sends it first
        const afterSend = Math.max(sent, current);
        expect(capPosition(current + 1, { total: 5, completedCount: afterSend })).toBe(current + 1);
      }
    }
  });

  it("agrees with reachedCountOf when photos are sent in order", () => {
    const ids = [11, 12, 13, 14, 15];
    for (let sent = 0; sent <= 5; sent++) {
      const reached = reachedCountOf(ids, ids.slice(0, sent), 1, 5);
      expect(capPosition(reached, { total: 5, completedCount: sent })).toBe(reached);
    }
  });
});

describe("completedCount, sessionTotal and wasSent", () => {
  it("counts each sent photo once, however its id was written", () => {
    expect(completedCount({ completedImageIDs: [1, "1", 2] })).toBe(2);
    expect(completedCount({})).toBe(0);
    expect(completedCount(null)).toBe(0);
  });

  it("takes the session's size from its photos, else the size chosen", () => {
    expect(sessionTotal({ imageIDs: ["a", "b", "c"], totalCount: 5 })).toBe(3);
    expect(sessionTotal({ imageIDs: [], totalCount: 5 })).toBe(5);
    expect(sessionTotal({})).toBe(0);
  });

  it("knows a photo already sent, comparing ids as text", () => {
    expect(wasSent({ completedImageIDs: [7, 42] }, "42")).toBe(true);
    expect(wasSent({ completedImageIDs: ["42"] }, 42)).toBe(true);
    expect(wasSent({ completedImageIDs: [7] }, 42)).toBe(false);
    expect(wasSent(null, 42)).toBe(false);
  });
});
