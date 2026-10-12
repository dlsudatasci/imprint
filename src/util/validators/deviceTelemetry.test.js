import { describe, it, expect } from "vitest";
import { summarizeInputTypes, classifyDevice, classifyBrowser, sanitizeDeviceTelemetry, isPhone } from "./deviceTelemetry";

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

