import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ObjectId } from "mongodb";
import { createMockCollection, createMockDb } from "@/test-utils/api-helpers";
import { sessionActivityCollections } from "@/test-utils/sessionActivity";
import {
  MODEL_VERSION_PATTERN,
  PROPOSAL_FIELDS,
  ACTIVE_SESSION_STATUS,
  validatePredictionFile,
  planPredictionUpdate,
  updateOperation,
  activeSessionCheck,
  runPredictionUpdate,
  INACTIVE_SESSION_HOURS,
  sessionLastActivity,
  isBlockingSession,
  blockingSessionCounts,
  userIdValues,
  countBlockingSessions,
} from "./predictionUpdate.mjs";
import { MODEL_VERSION_PATTERN as IMPORT_VERSION_PATTERN } from "./imageImport.mjs";

/**
 * update-predictions.mjs writes only the classifier's proposals onto the
 * suggestions images already have (16 Oct 2026). The detector's boxes, ids and
 * categories never change (chapter_4.tex and chapter_5.tex), the whole served
 * pool is covered, and nothing is written while any check fails.
 */
const rect = (x) => ({ type: "RECT", x, y: 10, width: 20, height: 40 });
const box = (id, comment, extra = {}) => ({ id, comment, mark: rect(10), selected: false, editable: false, isRejected: false, ...extra });

const IMAGES = [
  { imageID: 1, modelVersion: "v0-mapillary", poolStatus: "served", annotationList: [box("mly-0", "car"), box("mly-1", "tree", { confidence: 0.9 })] },
  { imageID: 2, modelVersion: "v0-mapillary", poolStatus: "served", annotationList: [] },
  { imageID: 3, modelVersion: "v0-mapillary", poolStatus: "reserve", annotationList: [box("atlas-0", "utility_post")] },
];

const file = (overrides = {}) => ({
  modelVersion: "v1-xgboost",
  decisionThreshold: 0.5,
  predictions: [
    { imageID: 1, proposals: [{ boxId: "mly-0", obstructs: false, probability: 0.2 }, { boxId: "mly-1", obstructs: true, probability: 0.8 }] },
    { imageID: 2, proposals: [] },
  ],
  ...overrides,
});

describe("validatePredictionFile", () => {
  it("accepts a well-formed file", () => {
    expect(validatePredictionFile(file())).toEqual([]);
  });

  it("uses the same version format as the image import", () => {
    expect(MODEL_VERSION_PATTERN.source).toBe(IMPORT_VERSION_PATTERN.source);
  });

  it("refuses a bad version, threshold, or empty list", () => {
    expect(validatePredictionFile(null)).toEqual(["the file must hold one JSON object"]);
    expect(validatePredictionFile(file({ modelVersion: "retrained" })).join(" ")).toContain("modelVersion");
    expect(validatePredictionFile(file({ decisionThreshold: 1.2 })).join(" ")).toContain("decisionThreshold");
    expect(validatePredictionFile(file({ decisionThreshold: undefined })).join(" ")).toContain("decisionThreshold");
    expect(validatePredictionFile(file({ predictions: [] })).join(" ")).toContain("non-empty");
  });

  it("refuses boxes: the detector's boxes are never rewritten", () => {
    const old = { modelVersion: "v1-retrained", decisionThreshold: 0.5, predictions: [{ imageID: 1, boxes: [{ x: 1, y: 1, width: 5, height: 5, category: "tree" }] }] };
    expect(validatePredictionFile(old).join(" ")).toContain("boxes are not accepted");
  });

  it("refuses a bad imageID, a repeated image, and a repeated box", () => {
    const bad = file({
      predictions: [
        { imageID: "1", proposals: [] },
        { imageID: 2, proposals: [] },
        { imageID: 2, proposals: [] },
        { imageID: 4, proposals: [{ boxId: "a", obstructs: false, probability: 0.1 }, { boxId: "a", obstructs: false, probability: 0.1 }] },
      ],
    });
    const text = validatePredictionFile(bad).join(" | ");
    expect(text).toContain("predictions[0]: imageID must be a positive whole number");
    expect(text).toContain("imageID 2 appears twice");
    expect(text).toContain("box a has two proposals");
  });

  it("refuses a proposal without a boolean answer or a probability from 0 to 1", () => {
    const bad = file({ predictions: [{ imageID: 1, proposals: [{ boxId: "mly-0", obstructs: "yes", probability: 0.2 }, { boxId: "mly-1", obstructs: true, probability: 81 }, { obstructs: true, probability: 0.9 }] }] });
    const text = validatePredictionFile(bad).join(" | ");
    expect(text).toContain("obstructs must be true or false");
    expect(text).toContain("probability must be a number from 0 to 1");
    expect(text).toContain("boxId must be a non-empty string");
  });

  it("refuses an answer that disagrees with the decision threshold, and accepts one exactly at it", () => {
    const wrong = file({ predictions: [{ imageID: 1, proposals: [{ boxId: "mly-0", obstructs: true, probability: 0.49 }] }] });
    expect(validatePredictionFile(wrong).join(" ")).toContain("below the threshold 0.5");
    const atIt = file({ predictions: [{ imageID: 1, proposals: [{ boxId: "mly-0", obstructs: true, probability: 0.5 }] }] });
    expect(validatePredictionFile(atIt)).toEqual([]);
  });
});

describe("planPredictionUpdate", () => {
  it("adds the proposal to each suggestion and changes nothing else about it", () => {
    const before = JSON.stringify(IMAGES);
    const { problems, updates, counts } = planPredictionUpdate(file(), IMAGES);
    expect(problems).toEqual([]);
    expect(JSON.stringify(IMAGES)).toBe(before);
    const one = updates.find((u) => u.imageID === 1);
    expect(one.fromVersion).toBe("v0-mapillary");
    expect(one.suggestionIds).toEqual(["mly-0", "mly-1"]);
    expect(one.annotationList).toEqual([
      { ...IMAGES[0].annotationList[0], [PROPOSAL_FIELDS.obstructs]: false, [PROPOSAL_FIELDS.probability]: 0.2 },
      { ...IMAGES[0].annotationList[1], [PROPOSAL_FIELDS.obstructs]: true, [PROPOSAL_FIELDS.probability]: 0.8 },
    ]);
    // An image with no suggestions still moves to the new version
    expect(updates.find((u) => u.imageID === 2).annotationList).toEqual([]);
    expect(counts).toEqual({ imagesInFile: 2, imagesUpdated: 2, imagesSkippedSameVersion: 0, proposalsWritten: 2, imagesNotServed: 0, servedImagesNotInFile: 0 });
  });

  it("names the fields proposedObstructs and obstructionProbability", () => {
    expect(PROPOSAL_FIELDS).toEqual({ obstructs: "proposedObstructs", probability: "obstructionProbability" });
  });

  it("refuses an image that does not exist, a box it does not have, and a suggestion left without a proposal", () => {
    const f = file({
      predictions: [
        { imageID: 1, proposals: [{ boxId: "mly-0", obstructs: false, probability: 0.2 }, { boxId: "pred-0", obstructs: false, probability: 0.1 }] },
        { imageID: 2, proposals: [] },
        { imageID: 99, proposals: [] },
      ],
    });
    const { problems } = planPredictionUpdate(f, IMAGES);
    expect(problems).toContain("imageID 99 is not in the Image collection");
    expect(problems).toContain("imageID 1: box pred-0 is not one of its suggestions");
    expect(problems).toContain("imageID 1: suggestion mly-1 has no proposal");
  });

  it("refuses a file that leaves out an image served to contributors, unless partial runs are allowed", () => {
    const f = file({ predictions: [file().predictions[0]] });
    const { problems, counts } = planPredictionUpdate(f, IMAGES);
    expect(problems.join(" ")).toContain("1 image(s) served to contributors are not in the file (2)");
    expect(counts.servedImagesNotInFile).toBe(1);
    expect(planPredictionUpdate(f, IMAGES, { allowPartial: true }).problems).toEqual([]);
  });

  it("accepts images not served to contributors, and counts them", () => {
    const f = file({ predictions: [...file().predictions, { imageID: 3, proposals: [{ boxId: "atlas-0", obstructs: false, probability: 0.3 }] }] });
    const { problems, counts } = planPredictionUpdate(f, IMAGES);
    expect(problems).toEqual([]);
    expect(counts.imagesNotServed).toBe(1);
  });

  it("skips images already at this version, unless forced, so a stopped run can be run again", () => {
    const images = IMAGES.map((img) => (img.imageID === 1 ? { ...img, modelVersion: "v1-xgboost" } : img));
    const skipped = planPredictionUpdate(file(), images);
    expect(skipped.updates.map((u) => u.imageID)).toEqual([2]);
    expect(skipped.counts.imagesSkippedSameVersion).toBe(1);
    expect(planPredictionUpdate(file(), images, { force: true }).updates.map((u) => u.imageID)).toEqual([1, 2]);
  });

  it("treats an image with no modelVersion as version null", () => {
    const images = IMAGES.map((img) => (img.imageID === 2 ? { ...img, modelVersion: undefined } : img));
    expect(planPredictionUpdate(file(), images).updates.find((u) => u.imageID === 2).fromVersion).toBeNull();
  });
});

describe("updateOperation", () => {
  it("writes the new list, version and time only while the image still has the version and the suggestions it was planned from", () => {
    const { updates } = planPredictionUpdate(file(), IMAGES);
    const now = new Date("2026-11-01T00:00:00Z");
    const op = updateOperation(updates[0], "v1-xgboost", now);
    expect(op.updateOne.filter).toEqual({
      imageID: 1,
      modelVersion: "v0-mapillary",
      annotationList: { $size: 2 },
      "annotationList.id": { $all: ["mly-0", "mly-1"] },
    });
    expect(op.updateOne.update).toEqual({ $set: { annotationList: updates[0].annotationList, modelVersion: "v1-xgboost", predictionUpdatedAt: now } });
    // No suggestions: no id condition
    expect(updateOperation(updates[1], "v1-xgboost", now).updateOne.filter).toEqual({ imageID: 2, modelVersion: "v0-mapillary", annotationList: { $size: 0 } });
  });
});

// S34 (19 Nov 2026): only sessions with activity in the last 12 hours hold
// back an update. Older ones are left open and ignored.
const NOW = new Date("2026-11-19T12:00:00Z");
const hoursAgo = (h, m = 0) => new Date(NOW.getTime() - (h * 60 + m) * 60 * 1000);
const USER = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "bbbbbbbbbbbbbbbbbbbbbbbb";

describe("the 12 hour rule (S34)", () => {
  it("is 12 hours", () => {
    expect(INACTIVE_SESSION_HOURS).toBe(12);
  });

  it("blocks a session with activity 11 h 59 min ago, and not one at exactly 12 h", () => {
    expect(isBlockingSession(hoursAgo(11, 59), NOW)).toBe(true);
    expect(isBlockingSession(hoursAgo(12), NOW)).toBe(false);
    expect(isBlockingSession(hoursAgo(72), NOW)).toBe(false);
  });

  it("treats a session with no date at all as in use", () => {
    expect(isBlockingSession(null, NOW)).toBe(true);
  });

  it("ages a session with no telemetry and no pending answers from createdAt", () => {
    expect(sessionLastActivity({ createdAt: hoursAgo(30) })).toEqual(hoursAgo(30));
  });

  it("takes the latest of createdAt, any telemetry event and any pending answer", () => {
    const last = sessionLastActivity({ createdAt: hoursAgo(50), telemetryTimes: [hoursAgo(40), hoursAgo(20)], pendingDates: [hoursAgo(30)] });
    expect(last).toEqual(hoursAgo(20));
    expect(sessionLastActivity({ createdAt: hoursAgo(50), telemetryTimes: [hoursAgo(40)], pendingDates: [hoursAgo(5)] })).toEqual(hoursAgo(5));
  });

  it("does not count an event from before the session started", () => {
    expect(sessionLastActivity({ createdAt: hoursAgo(30), telemetryTimes: [hoursAgo(31)] })).toEqual(hoursAgo(30));
  });

  it("counts the sessions each way, with the inactive ones' ids", () => {
    const counts = blockingSessionCounts(
      [{ _id: "s1", lastActivity: hoursAgo(1) }, { _id: "s2", lastActivity: hoursAgo(13) }, { _id: "s3", lastActivity: hoursAgo(100) }],
      NOW
    );
    expect(counts).toEqual({ active: 3, blocking: 1, inactive: 2, inactiveSessionIds: ["s2", "s3"] });
  });

  it("matches a user id as text and as an ObjectId", () => {
    const [text, oid] = userIdValues(USER);
    expect(text).toBe(USER);
    expect(oid).toBeInstanceOf(ObjectId);
    expect(oid.toHexString()).toBe(USER);
    expect(userIdValues(new ObjectId(USER)).map(String)).toEqual([USER, USER]);
    // Not an ObjectId's text: matched as text only
    expect(userIdValues("legacy-user")).toEqual(["legacy-user"]);
  });
});

describe("countBlockingSessions (S34)", () => {
  const session = (id, userId, createdAt) => ({ _id: id, userId, createdAt, status: "active" });

  it("reads only the active sessions, and changes none", async () => {
    const colls = sessionActivityCollections({ sessions: [session("s1", USER, hoursAgo(30))] });
    const db = createMockDb(colls);
    await countBlockingSessions(db, { now: NOW });
    expect(ACTIVE_SESSION_STATUS).toBe("active");
    expect(colls.sessions.find).toHaveBeenCalledWith({ status: "active" }, { projection: { _id: 1, userId: 1, createdAt: 1 } });
    for (const write of ["updateOne", "updateMany", "findOneAndUpdate", "deleteMany", "insertOne", "bulkWrite"]) {
      expect(colls.sessions[write]).not.toHaveBeenCalled();
    }
  });

  it("ages a session with no telemetry and no pending answers from createdAt", async () => {
    const db = createMockDb(sessionActivityCollections({ sessions: [session("s1", USER, hoursAgo(11)), session("s2", OTHER, hoursAgo(12))] }));
    expect(await countBlockingSessions(db, { now: NOW })).toEqual({ active: 2, blocking: 1, inactive: 1, inactiveSessionIds: ["s2"] });
  });

  it("counts any telemetry event of the user since createdAt, a leaderboard view included", async () => {
    const db = createMockDb(
      sessionActivityCollections({
        sessions: [session("s1", USER, hoursAgo(48))],
        telemetry: [{ userId: USER, event: "LEADERBOARD_VIEWED", timestamp: hoursAgo(2) }],
      })
    );
    expect(await countBlockingSessions(db, { now: NOW })).toMatchObject({ blocking: 1, inactive: 0 });
  });

  it("does not count telemetry from before createdAt, or another user's", async () => {
    const colls = sessionActivityCollections({
      // Started 13 h ago. The event 1 h before then is an earlier session's
      sessions: [session("s1", USER, hoursAgo(13))],
      telemetry: [
        { userId: USER, event: "SESSION_END", timestamp: hoursAgo(14) },
        { userId: OTHER, event: "IMAGE_SUBMITTED", timestamp: hoursAgo(1) },
      ],
    });
    expect(await countBlockingSessions(createMockDb(colls), { now: NOW })).toMatchObject({ blocking: 0, inactive: 1, inactiveSessionIds: ["s1"] });
    expect(colls.telemetry_logs.findOne.mock.calls[0][0].timestamp).toEqual({ $gte: hoursAgo(13) });
  });

  it("counts the date of a pending answer of the user", async () => {
    const db = createMockDb(
      sessionActivityCollections({
        sessions: [session("s1", USER, hoursAgo(48))],
        pending: [
          { userId: USER, status: "pending", date: hoursAgo(3) },
          { userId: USER, status: "completed", date: hoursAgo(1) },
        ],
      })
    );
    expect(await countBlockingSessions(db, { now: NOW })).toMatchObject({ blocking: 1 });
  });

  it("finds activity stored under the user id as text or as an ObjectId", async () => {
    for (const stored of [USER, new ObjectId(USER)]) {
      for (const sessionUser of [USER, new ObjectId(USER)]) {
        const viaTelemetry = sessionActivityCollections({
          sessions: [session("s1", sessionUser, hoursAgo(48))],
          telemetry: [{ userId: stored, event: "IMAGE_SUBMITTED", timestamp: hoursAgo(1) }],
        });
        expect((await countBlockingSessions(createMockDb(viaTelemetry), { now: NOW })).blocking).toBe(1);
        const viaPending = sessionActivityCollections({
          sessions: [session("s1", sessionUser, hoursAgo(48))],
          pending: [{ userId: stored, status: "pending", date: hoursAgo(1) }],
        });
        expect((await countBlockingSessions(createMockDb(viaPending), { now: NOW })).blocking).toBe(1);
      }
    }
  });
});

describe("activeSessionCheck", () => {
  it("allows a write with no active session, and gives the count", () => {
    expect(activeSessionCheck({ active: 0, blocking: 0, inactive: 0 }, { apply: true })).toEqual({ refuse: false, line: "0 active session(s).", message: null });
  });

  it("gives the counts each way, and allows a write when every session is inactive", () => {
    const check = activeSessionCheck({ active: 3, blocking: 0, inactive: 3 }, { apply: true });
    expect(check).toEqual({
      refuse: false,
      line: "3 active session(s): 0 with activity in the last 12 h, 3 inactive for 12 h or more (left open, ignored).",
      message: null,
    });
  });

  it("refuses --apply with any session in use, giving only the counts", () => {
    const { refuse, line, message } = activeSessionCheck({ active: 4, blocking: 1, inactive: 3 }, { apply: true });
    expect(refuse).toBe(true);
    expect(line).toBe("4 active session(s): 1 with activity in the last 12 h, 3 inactive for 12 h or more (left open, ignored).");
    expect(message).toBe("Refusing to write while 1 session has had activity in the last 12 h. No image was changed. Run again later.");
    expect(activeSessionCheck({ active: 2, blocking: 2, inactive: 0 }, { apply: true }).message).toContain("while 2 sessions have had activity");
  });

  it("only warns without --apply", () => {
    const { refuse, message } = activeSessionCheck({ active: 2, blocking: 1, inactive: 1 });
    expect(refuse).toBe(false);
    expect(message).toBe("Warning: --apply will refuse to write while 1 session has had activity in the last 12 h.");
  });

  it("has no em dashes or semicolons in what it prints", () => {
    const counts = { active: 4, blocking: 1, inactive: 3 };
    for (const { line, message } of [activeSessionCheck(counts), activeSessionCheck(counts, { apply: true })]) {
      expect(line).not.toMatch(/[\u2014;]/);
      expect(message).not.toMatch(/[\u2014;]/);
    }
  });
});

describe("runPredictionUpdate", () => {
  const now = NOW;

  function setup(activity = {}, { matchedCount, modifiedCount } = {}) {
    const data = file();
    const plan = { data, ...planPredictionUpdate(data, IMAGES) };
    const colls = sessionActivityCollections(activity);
    const images = createMockCollection({
      bulkWrite: vi.fn().mockResolvedValue({
        matchedCount: matchedCount ?? plan.updates.length,
        modifiedCount: modifiedCount ?? plan.updates.length,
      }),
    });
    const db = createMockDb({ ...colls, Image: images });
    return { plan, db, sessions: colls.sessions, images, logs: colls.telemetry_logs, run: (options) => runPredictionUpdate(db, plan, { now, ...options }) };
  }

  const inactive = { sessions: [{ _id: "s1", userId: USER, createdAt: hoursAgo(30) }, { _id: "s2", userId: OTHER, createdAt: hoursAgo(100) }] };
  const oneInUse = {
    sessions: [...inactive.sessions, { _id: "s3", userId: "cccccccccccccccccccccccc", createdAt: hoursAgo(48) }],
    telemetry: [{ userId: "cccccccccccccccccccccccc", event: "IMAGE_SUBMITTED", timestamp: hoursAgo(0, 30) }],
  };

  it("writes with only inactive sessions, leaves them untouched, and logs the counts and their ids", async () => {
    const { plan, images, sessions, logs, run } = setup(inactive);
    const result = await run({ apply: true, partial: false });
    expect(result).toMatchObject({
      activeSessions: 2,
      blockingSessions: 0,
      inactiveSessions: 2,
      inactiveSessionIds: ["s1", "s2"],
      refused: false,
      written: true,
      modified: plan.updates.length,
      unchanged: 0,
      logged: true,
      message: null,
    });
    expect(result.sessionsLine).toBe("2 active session(s): 0 with activity in the last 12 h, 2 inactive for 12 h or more (left open, ignored).");
    expect(images.bulkWrite).toHaveBeenCalledWith(plan.updates.map((u) => updateOperation(u, "v1-xgboost", now)), { ordered: false });
    for (const write of ["updateOne", "updateMany", "findOneAndUpdate", "deleteMany", "insertOne", "bulkWrite"]) {
      expect(sessions[write]).not.toHaveBeenCalled();
    }
    expect(logs.insertOne).toHaveBeenCalledWith({
      event: "MODEL_PREDICTIONS_UPDATED",
      modelVersion: "v1-xgboost",
      decisionThreshold: 0.5,
      predictionsInFile: plan.counts.imagesInFile,
      imagesUpdated: plan.updates.length,
      imagesSkippedSameVersion: plan.counts.imagesSkippedSameVersion,
      proposalsWritten: plan.counts.proposalsWritten,
      servedImagesNotInFile: plan.counts.servedImagesNotInFile,
      partial: false,
      activeSessions: 2,
      inactiveSessionsIgnored: 2,
      inactiveSessionIds: ["s1", "s2"],
      inactiveSessionHours: 12,
      timestamp: now,
    });
  });

  it("writes as before with no active session", async () => {
    const { logs, run } = setup();
    const result = await run({ apply: true });
    expect(result).toMatchObject({ activeSessions: 0, refused: false, written: true, logged: true, message: null, sessionsLine: "0 active session(s)." });
    expect(logs.insertOne.mock.calls[0][0]).toMatchObject({ activeSessions: 0, inactiveSessionsIgnored: 0, inactiveSessionIds: [], inactiveSessionHours: 12 });
  });

  it("writes nothing with --apply while one session is in use", async () => {
    const { images, logs, run } = setup(oneInUse);
    const result = await run({ apply: true });
    expect(result).toMatchObject({ activeSessions: 3, blockingSessions: 1, inactiveSessions: 2, refused: true, written: false, modified: 0, logged: false });
    expect(result.message).toBe("Refusing to write while 1 session has had activity in the last 12 h. No image was changed. Run again later.");
    expect(images.bulkWrite).not.toHaveBeenCalled();
    expect(images.updateOne).not.toHaveBeenCalled();
    expect(logs.insertOne).not.toHaveBeenCalled();
  });

  it("writes nothing without --apply, and gives the counts line", async () => {
    for (const activity of [{}, inactive, oneInUse]) {
      const { images, logs, run } = setup(activity);
      const result = await run({ apply: false });
      expect(result).toMatchObject({ refused: false, written: false });
      expect(result.sessionsLine).toMatch(/^\d+ active session\(s\)/);
      expect(result.message === null).toBe(activity !== oneInUse);
      expect(images.bulkWrite).not.toHaveBeenCalled();
      expect(logs.insertOne).not.toHaveBeenCalled();
    }
  });

  it("reports images that changed between the read and the write, and logs no cycle when none was modified", async () => {
    const { plan, logs, run } = setup({}, { matchedCount: 1, modifiedCount: 0 });
    const result = await run({ apply: true });
    expect(result.unchanged).toBe(plan.updates.length - 1);
    expect(result.logged).toBe(false);
    expect(logs.insertOne).not.toHaveBeenCalled();
  });
});

describe("update-predictions.mjs", () => {
  const source = readFileSync(new URL("../../../scripts/update-predictions.mjs", import.meta.url), "utf-8");

  it("writes only with --apply and has no option to override the active session check", () => {
    const options = source.match(/options: \{([\s\S]*?)\n {2}\},/)[1];
    const names = [...options.matchAll(/^\s+"?([\w-]+)"?: \{ type/gm)].map((m) => m[1]);
    expect(names).toEqual(["input", "apply", "dry-run", "force", "allow-partial"]);
    expect(source).toContain("apply: values.apply");
    expect(source).toContain("runPredictionUpdate(db");
    expect(source).not.toContain("bulkWrite");
  });

  it("explains the session check at the top", () => {
    const header = source.slice(0, source.indexOf("*/"));
    expect(header).not.toContain("never writes while any session is active");
    expect(header).toContain("activity in the last 12 hours");
    expect(header).toContain("left open");
    expect(header).toContain("MODEL_UPDATED");
    expect(header).toContain("--apply");
  });

  it("prints the counts line on every run", () => {
    expect(source).toContain("console.log(`  ${run.sessionsLine}`)");
  });
});
