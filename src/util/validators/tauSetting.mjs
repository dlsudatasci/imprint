/**
 * The suggestion threshold τ (S2, 29 Oct 2026).
 *
 * "A configurable threshold, τ, on the detection model's confidence score
 * determines which candidate objects are presented" (chapter_4.tex line 180),
 * chosen on the validation-set precision-recall curve at precision 0.80 (D7).
 * Every box with confidence 0.1 or more is stored and only those at or above
 * τ are shown (D8), so τ is a setting, not a constant in the browser bundle.
 *
 * It is one document in the `settings` collection, versioned with the
 * detector and shown on the admin Retraining tab:
 *
 *   { _id: "tau", value, modelVersion, chosenAt, validationPrecision, validationRecall }
 *
 * written only by scripts/set-tau.mjs, which logs TAU_CHANGED. With no valid
 * document the threshold is 0.5, as it was before.
 *
 * Each session keeps the τ it started with (`tau` on the session document),
 * so a batch shows the same suggestions from its first image to its last,
 * and annotationSubmit checks against what was shown. A new session reads the
 * stored value, so changing it changes what new sessions show, with no
 * deploy. Sessions started before 29 Oct 2026 have no `tau` and use the
 * stored value.
 *
 * `.mjs` with no `@/` imports, because the script imports it directly with
 * Node. Tests import it normally.
 */

export const DEFAULT_TAU = 0.5;
export const SETTINGS_COLLECTION = "settings";
export const TAU_SETTING_ID = "tau";
export const TAU_CHANGED_EVENT = "TAU_CHANGED";

const isUnitNumber = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/** True for a τ that can be used: a number from 0 to 1. */
export function isValidTau(value) {
  return isUnitNumber(value);
}

/** The τ a settings document gives, or the default when it is missing or not valid. */
export function tauFromSetting(doc) {
  return isValidTau(doc?.value) ? doc.value : DEFAULT_TAU;
}

/** The stored settings document, or null. */
export async function readTauSetting(db) {
  return db.collection(SETTINGS_COLLECTION).findOne({ _id: TAU_SETTING_ID });
}

/** The stored τ, or the default. */
export async function readTau(db) {
  return tauFromSetting(await readTauSetting(db));
}

/** The τ a session uses: the one it started with, else the stored one. */
export async function sessionTau(db, session) {
  return isValidTau(session?.tau) ? session.tau : readTau(db);
}

/**
 * What the admin Retraining tab shows: the value in use, and where it came
 * from. `isDefault` is true when nothing valid is stored.
 */
export function tauSummary(doc) {
  if (!isValidTau(doc?.value)) {
    return { value: DEFAULT_TAU, isDefault: true, modelVersion: null, chosenAt: null, validationPrecision: null, validationRecall: null };
  }
  return {
    value: doc.value,
    isDefault: false,
    modelVersion: doc.modelVersion ?? null,
    chosenAt: doc.chosenAt ?? null,
    validationPrecision: doc.validationPrecision ?? null,
    validationRecall: doc.validationRecall ?? null,
  };
}

/** A detector version: letters, digits, dots, dashes and underscores, as det-v1-rfdetr-small */
export const DETECTOR_VERSION_PATTERN = /^[A-Za-z0-9][\w.-]*$/;

/**
 * The problems with set-tau.mjs's arguments, as given on the command line
 * (strings). An empty list means they can be written.
 */
export function validateTauArgs({ value, modelVersion, precision, recall } = {}) {
  const problems = [];
  const numberArg = (name, raw) => {
    if (raw === undefined) {
      problems.push(`--${name} is required`);
      return;
    }
    const n = Number(raw);
    if (String(raw).trim() === "" || !isUnitNumber(n)) problems.push(`--${name} must be a number from 0 to 1, not ${JSON.stringify(raw)}`);
  };
  numberArg("value", value);
  numberArg("precision", precision);
  numberArg("recall", recall);
  if (modelVersion === undefined) problems.push("--model-version is required");
  else if (!DETECTOR_VERSION_PATTERN.test(modelVersion)) problems.push(`--model-version must look like det-v1-rfdetr-small, not ${JSON.stringify(modelVersion)}`);
  return problems;
}

/** The settings document for valid arguments. */
export function buildTauSetting({ value, modelVersion, precision, recall }, now = new Date()) {
  return {
    _id: TAU_SETTING_ID,
    value: Number(value),
    modelVersion,
    chosenAt: now,
    validationPrecision: Number(precision),
    validationRecall: Number(recall),
  };
}

/**
 * The write step of set-tau.mjs, for valid arguments. Reads the stored value
 * first. Without `apply` it writes nothing. With it, replaces the settings
 * document (creating it the first time) and logs TAU_CHANGED with who ran it,
 * the old value and model version (null when none was stored) and the new.
 * Returns { previous, next, written }.
 */
export async function runSetTau(db, args, { apply = false, changedBy = null, now = new Date() } = {}) {
  const previous = await readTauSetting(db);
  const next = buildTauSetting(args, now);
  if (!apply) return { previous, next, written: false };

  await db.collection(SETTINGS_COLLECTION).replaceOne({ _id: TAU_SETTING_ID }, next, { upsert: true });
  await db.collection("telemetry_logs").insertOne({
    event: TAU_CHANGED_EVENT,
    changedBy,
    oldValue: isValidTau(previous?.value) ? previous.value : null,
    newValue: next.value,
    oldModelVersion: previous?.modelVersion ?? null,
    newModelVersion: next.modelVersion,
    validationPrecision: next.validationPrecision,
    validationRecall: next.validationRecall,
    timestamp: now,
  });
  return { previous, next, written: true };
}
