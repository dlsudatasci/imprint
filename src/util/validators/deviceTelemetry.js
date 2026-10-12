/**
 * Device and input telemetry for each submitted image (9 Oct 2026,
 * IMPRINT_contributor_mobile.md section 8). The manuscript lists device type
 * as a covariate (chapter_4.tex lines 260 and 388), and contributors can now
 * annotate on phones and tablets.
 *
 * The client adds the fields below to its telemetry. The server keeps each one
 * only with an allowed value (sanitizeDeviceTelemetry) and adds the browser
 * family itself from the User-Agent header (classifyBrowser). The header is
 * never stored.
 */

export const INPUT_TYPES = Object.freeze(["mouse", "touch", "pen", "mixed", "none"]);
export const LAYOUTS = Object.freeze(["desktop", "sheet"]);
export const DEVICE_CLASSES = Object.freeze(["phone", "tablet", "desktop"]);
export const BROWSER_FAMILIES = Object.freeze(["safari", "chrome", "firefox", "edge", "samsung", "other"]);

/** A coarse pointer on a screen whose shorter side is under this many CSS px is a phone. */
export const PHONE_MAX_SIDE_PX = 600;

const POINTER_TYPES = new Set(["mouse", "touch", "pen"]);

/** The pointer types used on the photo for one image, as one value. */
export function summarizeInputTypes(types) {
  const used = [...new Set(types || [])].filter((t) => POINTER_TYPES.has(t));
  if (used.length === 0) return "none";
  if (used.length === 1) return used[0];
  return "mixed";
}

/** "phone", "tablet" or "desktop", from the primary pointer and the screen's shorter side. */
export function classifyDevice({ coarsePointer, screenMinSide } = {}) {
  if (coarsePointer !== true) return "desktop";
  return Number.isFinite(screenMinSide) && screenMinSide < PHONE_MAX_SIDE_PX ? "phone" : "tablet";
}

/**
 * A phone, as telemetry calls one: a coarse primary pointer on a screen whose
 * shorter side is under 600 CSS px. In the full-screen photo (12 Oct 2026) a
 * phone is asked to turn sideways, and a tablet is not.
 */
export function isPhone({ coarsePointer, screenMinSide } = {}) {
  return classifyDevice({ coarsePointer, screenMinSide }) === "phone";
}

/**
 * The browser family from a User-Agent string. Checked in this order because
 * each browser's string also names the ones it is built on: Samsung Internet
 * and Edge say Chrome, Chrome says Safari. Chrome and Firefox on iOS
 * (CriOS, FxiOS) count as Chrome and Firefox.
 */
export function classifyBrowser(ua) {
  if (typeof ua !== "string" || ua.length === 0) return "other";
  if (/SamsungBrowser\//.test(ua)) return "samsung";
  if (/\b(Edg|EdgA|EdgiOS)\//.test(ua)) return "edge";
  if (/\b(OPR|OPiOS)\//.test(ua)) return "other";
  if (/\b(Firefox|FxiOS)\//.test(ua)) return "firefox";
  if (/\b(CriOS|Chrome|Chromium)\//.test(ua)) return "chrome";
  if (/\bVersion\/[\d.]+.*Safari\//.test(ua)) return "safari";
  return "other";
}

const isIntIn = (min, max) => (v) => Number.isInteger(v) && v >= min && v <= max;
const isNumberIn = (min, max) => (v) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const oneOf = (list) => (v) => list.includes(v);

/** Each device field and the values it may take. */
export const DEVICE_FIELD_RULES = Object.freeze({
  inputType: oneOf(INPUT_TYPES),
  layout: oneOf(LAYOUTS),
  deviceClass: oneOf(DEVICE_CLASSES),
  viewportWidth: isIntIn(1, 20000),
  viewportHeight: isIntIn(1, 20000),
  photoDisplayWidth: isNumberIn(0, 20000),
  devicePixelRatio: isNumberIn(0.1, 10),
  maxZoom: isNumberIn(1, 5),
  loupeShownCount: isIntIn(0, 10000),
  boxesAddedWithButton: isIntIn(0, 10000),
  // The full-screen photo on phones (12 Oct 2026): times entered and time spent, per image
  focusModeCount: isIntIn(0, 10000),
  focusModeMs: isIntIn(0, 86400000),
});

/**
 * A copy of the client's telemetry with every device field kept only when its
 * value is allowed. Other fields pass through unchanged. A browserFamily from
 * the client is dropped: the server sets it. Anything that is not a plain
 * object gives an empty object.
 */
export function sanitizeDeviceTelemetry(telemetry) {
  if (!telemetry || typeof telemetry !== "object" || Array.isArray(telemetry)) return {};
  const out = { ...telemetry };
  delete out.browserFamily;
  for (const [field, allowed] of Object.entries(DEVICE_FIELD_RULES)) {
    if (field in out && !allowed(out[field])) delete out[field];
  }
  return out;
}
