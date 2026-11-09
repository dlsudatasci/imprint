import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { annotatorIdForms, completedSessionQuery, averageSessionDurationMs } from "./sessionDuration.js";

// S22 (9 Nov 2026): the admin page's average session duration, from the
// sessions collection, contributors' completed sessions only
const at = (minutes) => new Date(Date.UTC(2026, 10, 9, 8, minutes));
const session = (userId, status, startMin, endMin) => ({
  userId,
  status,
  createdAt: at(startMin),
  ...(endMin === undefined ? {} : { completedAt: at(endMin) }),
});

describe("averageSessionDurationMs", () => {
  it("gives the mean of two completed sessions of known length", () => {
    // 10 and 20 minutes
    const sessions = [session("u1", "completed", 0, 10), session("u2", "completed", 5, 25)];
    expect(averageSessionDurationMs(sessions)).toBe(15 * 60_000);
  });

  it("leaves out an abandoned or active session, and an annotator's, in either id form", () => {
    const annotator = new ObjectId();
    const other = new ObjectId();
    const ids = annotatorIdForms([{ _id: annotator }, { _id: other }]);
    const sessions = [
      session("u1", "completed", 0, 10),
      session("u2", "completed", 0, 20),
      { ...session("u3", "abandoned", 0, 59), completedAt: at(59) },
      session("u4", "active", 0, 45),
      // The session's userId is the string form of the account's _id
      session(annotator.toString(), "completed", 0, 50),
      session(other, "completed", 0, 40),
    ];
    expect(averageSessionDurationMs(sessions, ids)).toBe(15 * 60_000);
  });

  it("gives null, not 0, with no completed sessions", () => {
    expect(averageSessionDurationMs([])).toBeNull();
    expect(averageSessionDurationMs()).toBeNull();
    expect(averageSessionDurationMs([session("u1", "abandoned", 0, 10)])).toBeNull();
    const annotator = new ObjectId();
    expect(averageSessionDurationMs([session(annotator.toString(), "completed", 0, 10)], annotatorIdForms([{ _id: annotator }]))).toBeNull();
  });

  it("leaves out a completed session with no end time, a bad time, or an end before its start", () => {
    const sessions = [
      session("u1", "completed", 0, 30),
      session("old", "completed", 0),
      { userId: "nostart", status: "completed", completedAt: at(10) },
      { ...session("bad", "completed", 0, 10), completedAt: "not a date" },
      session("backwards", "completed", 20, 10),
    ];
    expect(averageSessionDurationMs(sessions)).toBe(30 * 60_000);
  });

  it("reads times stored as ISO strings as well as dates, and counts a zero-length session", () => {
    const sessions = [
      { userId: "u1", status: "completed", createdAt: at(0).toISOString(), completedAt: at(8).toISOString() },
      session("u2", "completed", 3, 3),
    ];
    expect(averageSessionDurationMs(sessions)).toBe(4 * 60_000);
  });
});

describe("completedSessionQuery", () => {
  it("asks for completed sessions with an end time, without annotators' ids", () => {
    const annotator = new ObjectId();
    const ids = annotatorIdForms([{ _id: annotator }]);
    expect(ids).toEqual([annotator.toString(), annotator]);
    expect(completedSessionQuery(ids)).toEqual({
      status: "completed",
      completedAt: { $exists: true },
      userId: { $nin: [annotator.toString(), annotator] },
    });
  });

  it("has no userId filter when there are no annotators", () => {
    expect(completedSessionQuery([])).toEqual({ status: "completed", completedAt: { $exists: true } });
    expect(annotatorIdForms()).toEqual([]);
  });
});
