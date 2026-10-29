import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createMockCollection, createMockDb } from "@/test-utils/api-helpers";
import {
  DEFAULT_TAU,
  TAU_SETTING_ID,
  TAU_CHANGED_EVENT,
  isValidTau,
  tauFromSetting,
  readTau,
  readTauSetting,
  sessionTau,
  tauSummary,
  validateTauArgs,
  buildTauSetting,
  runSetTau,
} from "./tauSetting.mjs";
import { TAU_THRESHOLD } from "./telemetryPayload";

/**
 * The suggestion threshold τ as a setting (S2, 29 Oct 2026): one settings
 * document, 0.5 when it is missing, kept on each session from its start, and
 * written only by scripts/set-tau.mjs, which logs TAU_CHANGED.
 */
const STORED = {
  _id: "tau",
  value: 0.43,
  modelVersion: "det-v1-rfdetr-small",
  chosenAt: new Date("2026-10-29T01:00:00Z"),
  validationPrecision: 0.8,
  validationRecall: 0.71,
};

function dbWith(setting) {
  const settings = createMockCollection({
    findOne: vi.fn().mockResolvedValue(setting),
    replaceOne: vi.fn().mockResolvedValue({ acknowledged: true }),
  });
  const logs = createMockCollection();
  return { settings, logs, db: createMockDb({ settings, telemetry_logs: logs }) };
}

describe("the fallback", () => {
  it("is 0.5, the value the tool used before, and the tool's TAU_THRESHOLD", () => {
    expect(DEFAULT_TAU).toBe(0.5);
    expect(TAU_THRESHOLD).toBe(DEFAULT_TAU);
  });

  it("is used when nothing valid is stored", () => {
    for (const doc of [null, undefined, {}, { value: null }, { value: "0.4" }, { value: 1.2 }, { value: -0.1 }, { value: Number.NaN }]) {
      expect(tauFromSetting(doc)).toBe(0.5);
    }
  });

  it("is not used for a stored value from 0 to 1", () => {
    expect(tauFromSetting(STORED)).toBe(0.43);
    expect(tauFromSetting({ value: 0 })).toBe(0);
    expect(tauFromSetting({ value: 1 })).toBe(1);
  });

  it("accepts only numbers from 0 to 1 as a τ", () => {
    expect([0, 0.43, 1].every(isValidTau)).toBe(true);
    expect([-0.01, 1.01, "0.5", null, undefined, Infinity].some(isValidTau)).toBe(false);
  });
});

describe("readTau and readTauSetting", () => {
  it("read the settings document with _id tau", async () => {
    const { db, settings } = dbWith(STORED);
    expect(await readTauSetting(db)).toBe(STORED);
    expect(await readTau(db)).toBe(0.43);
    expect(db.collection).toHaveBeenCalledWith("settings");
    expect(settings.findOne).toHaveBeenCalledWith({ _id: TAU_SETTING_ID });
  });

  it("give the fallback when nothing is stored", async () => {
    expect(await readTau(dbWith(null).db)).toBe(0.5);
  });
});

describe("sessionTau", () => {
  it("uses the τ the session started with, without reading the setting", async () => {
    const { db, settings } = dbWith(STORED);
    expect(await sessionTau(db, { status: "active", tau: 0.3 })).toBe(0.3);
    expect(settings.findOne).not.toHaveBeenCalled();
  });

  it("uses the stored τ for a session from before S2, or one with an unusable τ", async () => {
    const { db } = dbWith(STORED);
    expect(await sessionTau(db, { status: "active" })).toBe(0.43);
    expect(await sessionTau(db, { status: "active", tau: "0.3" })).toBe(0.43);
    expect(await sessionTau(db, null)).toBe(0.43);
  });

  it("falls back to 0.5 with neither", async () => {
    expect(await sessionTau(dbWith(null).db, { status: "active" })).toBe(0.5);
  });
});

describe("tauSummary (the admin Retraining tab)", () => {
  it("gives the stored value and where it came from", () => {
    expect(tauSummary(STORED)).toEqual({
      value: 0.43,
      isDefault: false,
      modelVersion: "det-v1-rfdetr-small",
      chosenAt: STORED.chosenAt,
      validationPrecision: 0.8,
      validationRecall: 0.71,
    });
  });

  it("says the default is in use when nothing valid is stored", () => {
    for (const doc of [null, { value: 7, modelVersion: "det-v1" }]) {
      expect(tauSummary(doc)).toEqual({ value: 0.5, isDefault: true, modelVersion: null, chosenAt: null, validationPrecision: null, validationRecall: null });
    }
  });
});

describe("validateTauArgs", () => {
  const good = { value: "0.43", modelVersion: "det-v1-rfdetr-small", precision: "0.80", recall: "0.71" };

  it("accepts the four arguments as the command line gives them", () => {
    expect(validateTauArgs(good)).toEqual([]);
    expect(validateTauArgs({ ...good, value: "0", precision: "1" })).toEqual([]);
  });

  it("requires every argument", () => {
    expect(validateTauArgs({})).toEqual([
      "--value is required",
      "--precision is required",
      "--recall is required",
      "--model-version is required",
    ]);
  });

  it("refuses numbers outside 0 to 1, text and empty values", () => {
    for (const bad of ["1.5", "-0.2", "abc", "", " ", "NaN"]) {
      expect(validateTauArgs({ ...good, value: bad })).toHaveLength(1);
      expect(validateTauArgs({ ...good, recall: bad })[0]).toContain("--recall must be a number from 0 to 1");
    }
  });

  it("refuses a model version with spaces or that starts with punctuation", () => {
    expect(validateTauArgs({ ...good, modelVersion: "det v1" })[0]).toContain("--model-version must look like det-v1-rfdetr-small");
    expect(validateTauArgs({ ...good, modelVersion: "-det" })).toHaveLength(1);
    expect(validateTauArgs({ ...good, modelVersion: "det-v1.2_rfdetr_small" })).toEqual([]);
  });

  it("has no em dashes or semicolons in what it prints", () => {
    for (const p of validateTauArgs({ value: "x", modelVersion: "a b" })) expect(p).not.toMatch(/[—;]/);
  });
});

describe("buildTauSetting", () => {
  it("builds the settings document with numbers", () => {
    const now = new Date("2026-10-29T02:00:00Z");
    expect(buildTauSetting({ value: "0.43", modelVersion: "det-v1-rfdetr-small", precision: "0.80", recall: "0.71" }, now)).toEqual({
      _id: "tau",
      value: 0.43,
      modelVersion: "det-v1-rfdetr-small",
      chosenAt: now,
      validationPrecision: 0.8,
      validationRecall: 0.71,
    });
  });
});

describe("runSetTau (scripts/set-tau.mjs)", () => {
  const args = { value: "0.38", modelVersion: "det-v1-rfdetr-medium", precision: "0.81", recall: "0.66" };
  const now = new Date("2026-10-29T03:00:00Z");

  it("writes nothing without --apply, and reports the stored and the new value", async () => {
    const { db, settings, logs } = dbWith(STORED);
    const result = await runSetTau(db, args, { now });
    expect(result).toEqual({ previous: STORED, next: buildTauSetting(args, now), written: false });
    expect(settings.replaceOne).not.toHaveBeenCalled();
    expect(logs.insertOne).not.toHaveBeenCalled();
  });

  it("with --apply replaces the document and logs TAU_CHANGED with who, the old and the new", async () => {
    const { db, settings, logs } = dbWith(STORED);
    const result = await runSetTau(db, args, { apply: true, changedBy: "rans", now });
    expect(result.written).toBe(true);
    expect(settings.replaceOne).toHaveBeenCalledWith({ _id: "tau" }, buildTauSetting(args, now), { upsert: true });
    expect(logs.insertOne).toHaveBeenCalledWith({
      event: TAU_CHANGED_EVENT,
      changedBy: "rans",
      oldValue: 0.43,
      newValue: 0.38,
      oldModelVersion: "det-v1-rfdetr-small",
      newModelVersion: "det-v1-rfdetr-medium",
      validationPrecision: 0.81,
      validationRecall: 0.66,
      timestamp: now,
    });
    expect(TAU_CHANGED_EVENT).toBe("TAU_CHANGED");
  });

  it("creates the document the first time, logging the old value as null", async () => {
    const { db, settings, logs } = dbWith(null);
    await runSetTau(db, args, { apply: true, changedBy: "rans", now });
    expect(settings.replaceOne.mock.calls[0][2]).toEqual({ upsert: true });
    expect(logs.insertOne.mock.calls[0][0]).toMatchObject({ oldValue: null, oldModelVersion: null, newValue: 0.38 });
  });
});

describe("set-tau.mjs", () => {
  const source = readFileSync(new URL("../../../scripts/set-tau.mjs", import.meta.url), "utf-8");

  it("writes only with --apply, through runSetTau", () => {
    const options = source.match(/options: \{([\s\S]*?)\n {2}\},/)[1];
    const names = [...options.matchAll(/^\s+"?([\w-]+)"?: \{ type/gm)].map((m) => m[1]);
    expect(names).toEqual(["value", "model-version", "precision", "recall", "by", "apply"]);
    expect(source).toContain("runSetTau(db, args, { apply: values.apply, changedBy })");
    expect(source).not.toMatch(/replaceOne|insertOne|updateOne/);
  });

  it("never prints who ran it", () => {
    for (const line of source.split("\n").filter((l) => /console\.(log|error|warn)/.test(l))) {
      expect(line).not.toContain("changedBy");
    }
  });
});
