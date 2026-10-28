import { describe, it, expect } from "vitest";
import { summarizeInputTypes, classifyDevice, classifyBrowser, sanitizeDeviceTelemetry, sanitizeQcTelemetry, QC_FIELD_RULES, isPhone } from "./deviceTelemetry";

/** Device and input telemetry for each submitted image (9 Oct 2026). */
const UA = {
  iosSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iosChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
};

describe("summarizeInputTypes", () => {
  it("names the one pointer type used, mixed for more, none for none", () => {
    expect(summarizeInputTypes(new Set(["mouse"]))).toBe("mouse");
    expect(summarizeInputTypes(new Set(["touch"]))).toBe("touch");
    expect(summarizeInputTypes(new Set(["pen"]))).toBe("pen");
    expect(summarizeInputTypes(new Set(["touch", "pen"]))).toBe("mixed");
    expect(summarizeInputTypes(new Set())).toBe("none");
    expect(summarizeInputTypes(undefined)).toBe("none");
    expect(summarizeInputTypes(["kinect"])).toBe("none");
  });
});

describe("classifyDevice", () => {
  it("is a phone under 600 px with a coarse pointer, a tablet from 600, desktop otherwise", () => {
    expect(classifyDevice({ coarsePointer: true, screenMinSide: 599 })).toBe("phone");
    expect(classifyDevice({ coarsePointer: true, screenMinSide: 600 })).toBe("tablet");
    expect(classifyDevice({ coarsePointer: false, screenMinSide: 390 })).toBe("desktop");
    expect(classifyDevice({})).toBe("desktop");
  });
});

describe("classifyBrowser", () => {
  it("names the family of real browsers' strings", () => {
    expect(classifyBrowser(UA.iosSafari)).toBe("safari");
    expect(classifyBrowser(UA.iosChrome)).toBe("chrome");
    expect(classifyBrowser(UA.androidChrome)).toBe("chrome");
    expect(classifyBrowser(UA.samsung)).toBe("samsung");
    expect(classifyBrowser(UA.edge)).toBe("edge");
    expect(classifyBrowser(UA.firefox)).toBe("firefox");
  });

  it("is other for an unknown or missing string", () => {
    expect(classifyBrowser("curl/8.4.0")).toBe("other");
    expect(classifyBrowser(undefined)).toBe("other");
    expect(classifyBrowser("")).toBe("other");
  });
});

describe("sanitizeDeviceTelemetry", () => {
  const good = {
    inputType: "touch",
    layout: "sheet",
    deviceClass: "phone",
    viewportWidth: 390,
    viewportHeight: 844,
    photoDisplayWidth: 390,
    devicePixelRatio: 3,
    maxZoom: 2.5,
    loupeShownCount: 4,
    boxesAddedWithButton: 1,
  };

  it("keeps allowed values and passes other telemetry through", () => {
    expect(sanitizeDeviceTelemetry({ ...good, imageDurationMs: 5000 })).toEqual({ ...good, imageDurationMs: 5000 });
  });

  it("drops values outside the lists", () => {
    const out = sanitizeDeviceTelemetry({ ...good, inputType: "kinect", layout: "tablet", deviceClass: "watch" });
    expect(out).not.toHaveProperty("inputType");
    expect(out).not.toHaveProperty("layout");
    expect(out).not.toHaveProperty("deviceClass");
  });

  it("drops non-finite and out-of-range numbers", () => {
    const out = sanitizeDeviceTelemetry({
      ...good,
      viewportWidth: 390.5,
      viewportHeight: -1,
      photoDisplayWidth: Infinity,
      devicePixelRatio: NaN,
      maxZoom: 9,
      loupeShownCount: "4",
      boxesAddedWithButton: -2,
    });
    for (const field of ["viewportWidth", "viewportHeight", "photoDisplayWidth", "devicePixelRatio", "maxZoom", "loupeShownCount", "boxesAddedWithButton"]) {
      expect(out).not.toHaveProperty(field);
    }
  });

  it("drops a browser family sent by the client, and gives {} for anything not an object", () => {
    expect(sanitizeDeviceTelemetry({ browserFamily: "safari" })).toEqual({});
    expect(sanitizeDeviceTelemetry("text")).toEqual({});
    expect(sanitizeDeviceTelemetry([1, 2])).toEqual({});
    expect(sanitizeDeviceTelemetry(null)).toEqual({});
  });

  it("does not change the telemetry it was given", () => {
    const input = { ...good, inputType: "kinect" };
    sanitizeDeviceTelemetry(input);
    expect(input.inputType).toBe("kinect");
  });
});

// The full-screen photo on phones (12 Oct 2026)
describe("isPhone", () => {
  it("is a coarse pointer on a screen under 600 px, and nothing else", () => {
    expect(isPhone({ coarsePointer: true, screenMinSide: 599 })).toBe(true);
    expect(isPhone({ coarsePointer: true, screenMinSide: 600 })).toBe(false);
    expect(isPhone({ coarsePointer: false, screenMinSide: 390 })).toBe(false);
    expect(isPhone()).toBe(false);
  });
});

describe("full-screen telemetry", () => {
  it("keeps focusModeCount and focusModeMs when valid, and drops them when not", () => {
    expect(sanitizeDeviceTelemetry({ focusModeCount: 2, focusModeMs: 45000 })).toEqual({ focusModeCount: 2, focusModeMs: 45000 });
    expect(sanitizeDeviceTelemetry({ focusModeCount: 0, focusModeMs: 0 })).toEqual({ focusModeCount: 0, focusModeMs: 0 });
    for (const bad of [{ focusModeCount: -1 }, { focusModeCount: 1.5 }, { focusModeCount: "2" }, { focusModeMs: 86400001 }, { focusModeMs: NaN }, { focusModeMs: 12.5 }]) {
      expect(sanitizeDeviceTelemetry(bad)).toEqual({});
    }
  });
});


// The quality-check timing (S10, 28 Oct 2026)
describe("sanitizeQcTelemetry", () => {
  const WEEK = 7 * 86400000;
  const good = {
    msLongestIdle: 660000,
    msFromLastIdleToSubmit: 3000,
    suggestionConfidences: [
      { id: "s1", confidence: 0.9, action: "accepted", msToAnswer: 800 },
      { id: "s2", confidence: 0.4, action: "deleted", msToAnswer: null },
      { id: "s3", confidence: 0.2, action: "hidden_below_tau", msToAnswer: null },
    ],
  };

  it("names the two image-level fields", () => {
    expect(Object.keys(QC_FIELD_RULES)).toEqual(["msLongestIdle", "msFromLastIdleToSubmit"]);
  });

  it("keeps whole milliseconds and null, and passes other telemetry through", () => {
    expect(sanitizeQcTelemetry({ ...good, imageDurationMs: 700000 })).toEqual({ ...good, imageDurationMs: 700000 });
    expect(sanitizeQcTelemetry({ msLongestIdle: 0, msFromLastIdleToSubmit: null })).toEqual({ msLongestIdle: 0, msFromLastIdleToSubmit: null });
    expect(sanitizeQcTelemetry({ msLongestIdle: WEEK, msFromLastIdleToSubmit: WEEK })).toEqual({ msLongestIdle: WEEK, msFromLastIdleToSubmit: WEEK });
  });

  it("drops fractions, negatives, strings, NaN and anything over a week", () => {
    for (const bad of [1.5, -1, "3000", NaN, Infinity, WEEK + 1, true, {}]) {
      const out = sanitizeQcTelemetry({ msLongestIdle: bad, msFromLastIdleToSubmit: bad });
      expect(out).not.toHaveProperty("msLongestIdle");
      expect(out).not.toHaveProperty("msFromLastIdleToSubmit");
    }
    // null means "not over 10 minutes" for the second field only
    expect(sanitizeQcTelemetry({ msLongestIdle: null })).toEqual({});
  });

  it("drops a bad msToAnswer from its entry and keeps the rest of the entry", () => {
    const out = sanitizeQcTelemetry({
      suggestionConfidences: [
        { id: "s1", action: "accepted", msToAnswer: -5 },
        { id: "s2", action: "accepted", msToAnswer: "fast" },
        { id: "s3", action: "accepted", msToAnswer: 250.5 },
        { id: "s4", action: "accepted", msToAnswer: 250 },
        { id: "s5", action: "accepted" },
      ],
    });
    expect(out.suggestionConfidences).toEqual([
      { id: "s1", action: "accepted" },
      { id: "s2", action: "accepted" },
      { id: "s3", action: "accepted" },
      { id: "s4", action: "accepted", msToAnswer: 250 },
      { id: "s5", action: "accepted" },
    ]);
  });

  it("drops every quality-check field for annotators", () => {
    const out = sanitizeQcTelemetry({ ...good, msObjectStep: 4000 }, { isAnnotator: true });
    expect(out).not.toHaveProperty("msLongestIdle");
    expect(out).not.toHaveProperty("msFromLastIdleToSubmit");
    expect(out.msObjectStep).toBe(4000);
    expect(out.suggestionConfidences).toEqual([
      { id: "s1", confidence: 0.9, action: "accepted" },
      { id: "s2", confidence: 0.4, action: "deleted" },
      { id: "s3", confidence: 0.2, action: "hidden_below_tau" },
    ]);
  });

  it("leaves a non-array suggestionConfidences and odd entries alone, gives {} for anything not an object", () => {
    expect(sanitizeQcTelemetry({ suggestionConfidences: "x" })).toEqual({ suggestionConfidences: "x" });
    expect(sanitizeQcTelemetry({ suggestionConfidences: [null, 3] })).toEqual({ suggestionConfidences: [null, 3] });
    expect(sanitizeQcTelemetry("text")).toEqual({});
    expect(sanitizeQcTelemetry([1])).toEqual({});
    expect(sanitizeQcTelemetry(null)).toEqual({});
  });

  it("does not change the telemetry it was given", () => {
    const input = JSON.parse(JSON.stringify(good));
    input.msLongestIdle = -1;
    input.suggestionConfidences[0].msToAnswer = -1;
    const copy = JSON.parse(JSON.stringify(input));
    sanitizeQcTelemetry(input, { isAnnotator: true });
    expect(input).toEqual(copy);
  });
});
