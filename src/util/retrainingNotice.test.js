import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ObjectId } from "mongodb";

vi.mock("@/util/telemetryLogger", () => ({ logTelemetryEvent: vi.fn() }));

import { logTelemetryEvent } from "@/util/telemetryLogger";
import { buildRetrainingReadyMail, notifyRetrainingReady, RETRAINING_NOTICE_ID } from "./retrainingNotice.js";

/**
 * S26 (12 Nov 2026). An in-memory database: annotations and Image apply the
 * query they are sent (status, source $ne, imageID $in), telemetry_logs the
 * event, and settings applies $addToSet, $pull and upsert in one step, as
 * MongoDB does, so two claims at once are decided by the claim.
 */
function matches(doc, query = {}) {
  return Object.entries(query).every(([key, want]) => {
    if (want && typeof want === "object" && "$ne" in want) return doc[key] !== want.$ne;
    if (want && typeof want === "object" && "$in" in want) return want.$in.includes(doc[key]);
    return doc[key] === want;
  });
}

function fakeDb({ annotations = [], images = [], cycles = [] } = {}) {
  const settingsDocs = new Map();
  const finder = (docs) => ({ find: vi.fn((query) => ({ toArray: async () => docs.filter((d) => matches(d, query)) })) });
  const settings = {
    updateOne: vi.fn(async (filter, update, options = {}) => {
      let doc = settingsDocs.get(filter._id);
      let upsertedCount = 0;
      if (!doc) {
        if (!options.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        doc = { _id: filter._id };
        settingsDocs.set(filter._id, doc);
        upsertedCount = 1;
      }
      let changed = false;
      for (const [field, value] of Object.entries(update.$addToSet || {})) {
        doc[field] = doc[field] || [];
        if (!doc[field].includes(value)) { doc[field].push(value); changed = true; }
      }
      for (const [field, value] of Object.entries(update.$pull || {})) {
        const before = (doc[field] || []).length;
        doc[field] = (doc[field] || []).filter((v) => v !== value);
        if (doc[field].length !== before) changed = true;
      }
      return { matchedCount: upsertedCount ? 0 : 1, modifiedCount: !upsertedCount && changed ? 1 : 0, upsertedCount };
    }),
  };
  const collections = {
    annotations: finder(annotations),
    Image: finder(images),
    telemetry_logs: finder(cycles.map((modelVersion) => ({ event: "MODEL_PREDICTIONS_UPDATED", modelVersion }))),
    settings,
  };
  return {
    collection: vi.fn((name) => collections[name]),
    settingsDocs,
    settings,
  };
}

// A box the retraining export keeps: a taxonomy category, a Yes or No, and
// 200 by 200 px on a 1920 by 1080 photo
let boxSeq = 0;
const usableBox = () => ({
  id: `box-${++boxSeq}`, label: "car", editable: true,
  mark: { x: 10, y: 10, width: 200, height: 200 }, obstructs: true,
});

/** `judgments` usable boxes over `perAnnotation`-box contributor annotations. */
function contributorData(judgments, perAnnotation = 100) {
  const annotations = [];
  const images = [];
  for (let i = 0; i * perAnnotation < judgments; i++) {
    const n = Math.min(perAnnotation, judgments - i * perAnnotation);
    images.push({ imageID: 1000 + i, isReference: false, width: 1920, height: 1080 });
    annotations.push({
      imageID: 1000 + i, userId: new ObjectId(), status: "completed", source: "contributor",
      selectedObjectsID: [], newObjects: Array.from({ length: n }, usableBox),
    });
  }
  return { annotations, images };
}

const ADDRESS = "researcher@example.org";
let savedEnv;

beforeEach(() => {
  vi.clearAllMocks();
  savedEnv = { ...process.env };
  process.env.RETRAINING_NOTIFY_EMAIL = ADDRESS;
  process.env.NEXTAUTH_URL = "https://imprint.example.org";
  process.env.EMAIL_USER = "imprint@example.org";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = savedEnv;
  vi.restoreAllMocks();
});

describe("buildRetrainingReadyMail (S26)", () => {
  const progress = {
    contributorJudgments: 2013,
    contributorAnnotations: 412,
    contributorAnnotationsOnReference: 9,
    retrainingCyclesRun: 0,
    retrainingIncrement: 2000,
    nextRetrainingAt: 2000,
    judgmentsUntilNext: 0,
  };

  it("carries the cycle, the target, the judgments and the annotations", () => {
    const mail = buildRetrainingReadyMail({ to: ADDRESS, progress, baseUrl: "https://imprint.example.org", from: "imprint@example.org" });
    expect(mail.to).toBe(ADDRESS);
    expect(mail.from).toBe('"Imprint Support" <imprint@example.org>');
    expect(mail.subject).toBe("Imprint: retraining cycle 1 is ready");
    expect(mail.text).toContain("Contributors have reached 2,013 usable judgments, and cycle 1 starts at 2,000.");
    expect(mail.text).toContain("They come from 412 contributor annotations.");
    expect(mail.text).toContain("The cycle takes the first 2,000 judgments by time");
  });

  it("names cycle N as cycles run + 1", () => {
    const mail = buildRetrainingReadyMail({ to: ADDRESS, progress: { ...progress, retrainingCyclesRun: 1, nextRetrainingAt: 4000, contributorJudgments: 4000 }, baseUrl: "https://x.org" });
    expect(mail.subject).toBe("Imprint: retraining cycle 2 is ready");
    expect(mail.text).toContain("cycle 2 starts at 4,000.");
  });

  it("links the Retraining tab from the base URL, with a trailing slash dropped", () => {
    const mail = buildRetrainingReadyMail({ to: ADDRESS, progress, baseUrl: "https://imprint.example.org/" });
    expect(mail.text).toContain("Retraining tab: https://imprint.example.org/admin");
    expect(mail.text).not.toContain("org//admin");
  });

  it("falls back to NEXTAUTH_URL and EMAIL_USER", () => {
    const mail = buildRetrainingReadyMail({ to: ADDRESS, progress });
    expect(mail.text).toContain("Retraining tab: https://imprint.example.org/admin");
    expect(mail.from).toBe('"Imprint Support" <imprint@example.org>');
  });

  it("has no em dash, no semicolon and no user field", () => {
    const mail = buildRetrainingReadyMail({ to: ADDRESS, progress, baseUrl: "https://imprint.example.org" });
    for (const part of [mail.subject, mail.text]) {
      expect(part).not.toMatch(/[—;]/);
      expect(part).not.toMatch(/username|userId|@|ObjectId/i);
    }
    expect(Object.keys(mail).sort()).toEqual(["from", "subject", "text", "to"]);
  });
});

describe("notifyRetrainingReady (S26)", () => {
  it("without RETRAINING_NOTIFY_EMAIL reads, claims and sends nothing", async () => {
    for (const value of [undefined, "", "   "]) {
      if (value === undefined) delete process.env.RETRAINING_NOTIFY_EMAIL;
      else process.env.RETRAINING_NOTIFY_EMAIL = value;
      const db = fakeDb(contributorData(2500));
      const send = vi.fn();
      const result = await notifyRetrainingReady(db, { send });
      expect(result).toEqual({ sent: false, reason: "no-address" });
      expect(db.collection).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    }
    expect(logTelemetryEvent).not.toHaveBeenCalled();
  });

  it("below the target claims and sends nothing", async () => {
    const db = fakeDb(contributorData(1999));
    const send = vi.fn();
    const result = await notifyRetrainingReady(db, { send });
    expect(result).toEqual({ sent: false, reason: "not-ready", target: 2000 });
    expect(db.settings.updateOne).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(logTelemetryEvent).not.toHaveBeenCalled();
  });

  it("counts only completed contributor judgments, as the Retraining tab does", async () => {
    const { annotations, images } = contributorData(2000);
    // Annotators' and pending answers are not counted, so 1,900 is not ready
    annotations[0].source = "annotator";
    annotations[1].status = "pending";
    const db = fakeDb({ annotations, images });
    const send = vi.fn();
    expect(await notifyRetrainingReady(db, { send })).toMatchObject({ sent: false, reason: "not-ready" });
    expect(send).not.toHaveBeenCalled();
  });

  it("at the target claims it, sends one mail to the address and logs one RETRAINING_READY", async () => {
    const db = fakeDb(contributorData(2000));
    const send = vi.fn().mockResolvedValue({});
    const result = await notifyRetrainingReady(db, { send });

    expect(result).toEqual({ sent: true, target: 2000 });
    expect(db.settings.updateOne).toHaveBeenCalledWith(
      { _id: RETRAINING_NOTICE_ID },
      { $addToSet: { notifiedTargets: 2000 } },
      { upsert: true },
    );
    expect(db.settingsDocs.get(RETRAINING_NOTICE_ID).notifiedTargets).toEqual([2000]);
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe(ADDRESS);
    expect(mail.subject).toBe("Imprint: retraining cycle 1 is ready");
    expect(mail.text).toContain("reached 2,000 usable judgments");
    expect(mail.text).toContain("They come from 20 contributor annotations.");

    expect(logTelemetryEvent).toHaveBeenCalledTimes(1);
    const event = logTelemetryEvent.mock.calls[0][0];
    expect(event).toEqual({
      event: "RETRAINING_READY", target: 2000, contributorJudgments: 2000, contributorAnnotations: 20, cycle: 1,
    });
  });

  it("past the target sends the same way", async () => {
    const db = fakeDb(contributorData(2150));
    const send = vi.fn().mockResolvedValue({});
    expect(await notifyRetrainingReady(db, { send })).toEqual({ sent: true, target: 2000 });
    expect(send.mock.calls[0][0].text).toContain("reached 2,150 usable judgments, and cycle 1 starts at 2,000.");
  });

  it("called again at the same target sends no second mail", async () => {
    const db = fakeDb(contributorData(2000));
    const send = vi.fn().mockResolvedValue({});
    await notifyRetrainingReady(db, { send });
    const again = await notifyRetrainingReady(db, { send });

    expect(again).toEqual({ sent: false, reason: "already-notified", target: 2000 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(logTelemetryEvent).toHaveBeenCalledTimes(1);
  });

  it("two calls at once send one mail, the claim decides", async () => {
    const db = fakeDb(contributorData(2000));
    const send = vi.fn().mockResolvedValue({});
    const results = await Promise.all([notifyRetrainingReady(db, { send }), notifyRetrainingReady(db, { send })]);

    expect(db.settings.updateOne).toHaveBeenCalledTimes(2);
    expect(results.filter((r) => r.sent)).toHaveLength(1);
    expect(results.filter((r) => r.reason === "already-notified")).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("a duplicate key from two first-ever claims counts as already notified", async () => {
    const db = fakeDb(contributorData(2000));
    db.settings.updateOne.mockRejectedValueOnce(Object.assign(new Error("E11000 duplicate key"), { code: 11000 }));
    const send = vi.fn();
    expect(await notifyRetrainingReady(db, { send })).toEqual({ sent: false, reason: "already-notified", target: 2000 });
    expect(send).not.toHaveBeenCalled();
  });

  it("a send that throws releases the target, is not thrown on, and the next call sends", async () => {
    const db = fakeDb(contributorData(2000));
    const send = vi.fn()
      .mockRejectedValueOnce(new Error("SMTP down"))
      .mockResolvedValueOnce({});

    const first = await notifyRetrainingReady(db, { send });
    expect(first).toEqual({ sent: false, reason: "send-failed", target: 2000 });
    expect(db.settings.updateOne).toHaveBeenLastCalledWith({ _id: RETRAINING_NOTICE_ID }, { $pull: { notifiedTargets: 2000 } });
    expect(db.settingsDocs.get(RETRAINING_NOTICE_ID).notifiedTargets).toEqual([]);
    expect(console.error).toHaveBeenCalled();
    expect(logTelemetryEvent).not.toHaveBeenCalled();

    const second = await notifyRetrainingReady(db, { send });
    expect(second).toEqual({ sent: true, target: 2000 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(db.settingsDocs.get(RETRAINING_NOTICE_ID).notifiedTargets).toEqual([2000]);
    expect(logTelemetryEvent).toHaveBeenCalledTimes(1);
  });

  it("a failed release is logged, not thrown on", async () => {
    const db = fakeDb(contributorData(2000));
    const claim = db.settings.updateOne.getMockImplementation();
    db.settings.updateOne
      .mockImplementationOnce(claim)
      .mockRejectedValueOnce(new Error("db gone"));
    const send = vi.fn().mockRejectedValue(new Error("SMTP down"));
    expect(await notifyRetrainingReady(db, { send })).toEqual({ sent: false, reason: "send-failed", target: 2000 });
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it("never puts the address in a log line", async () => {
    const db = fakeDb(contributorData(2000));
    await notifyRetrainingReady(db, { send: vi.fn().mockRejectedValue(new Error("SMTP down")) });
    for (const call of console.error.mock.calls) {
      expect(String(call[0])).not.toContain(ADDRESS);
    }
  });

  it("after a cycle (v2-xgboost), 2,100 judgments is not ready for 4,000 and 4,000 sends cycle 2's mail", async () => {
    const send = vi.fn().mockResolvedValue({});
    const cycles = ["v1-xgboost", "v2-xgboost", "v2-xgboost"];

    const at2100 = fakeDb({ ...contributorData(2100), cycles });
    expect(await notifyRetrainingReady(at2100, { send })).toEqual({ sent: false, reason: "not-ready", target: 4000 });
    expect(send).not.toHaveBeenCalled();

    const at4000 = fakeDb({ ...contributorData(4000), cycles });
    expect(await notifyRetrainingReady(at4000, { send })).toEqual({ sent: true, target: 4000 });
    expect(send.mock.calls[0][0].subject).toBe("Imprint: retraining cycle 2 is ready");
    expect(send.mock.calls[0][0].text).toContain("cycle 2 starts at 4,000.");
    expect(logTelemetryEvent).toHaveBeenCalledWith(expect.objectContaining({ target: 4000, cycle: 2 }));
  });

  it("a failed read throws, for the caller's try/catch", async () => {
    const db = fakeDb(contributorData(2000));
    db.collection("annotations").find.mockImplementation(() => { throw new Error("read failed"); });
    await expect(notifyRetrainingReady(db, { send: vi.fn() })).rejects.toThrow("read failed");
  });
});
