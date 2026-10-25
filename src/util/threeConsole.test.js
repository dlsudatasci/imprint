import { describe, it, expect, vi, afterEach } from "vitest";
import * as THREE from "three";
import { CLOCK_DEPRECATION, threeConsole, quietClockDeprecation } from "./threeConsole";

/**
 * The THREE.Clock deprecation kept out of the console (26 Oct 2026), with the
 * installed three.js: @react-three/fiber 9 makes a Clock for every <Canvas>.
 */
afterEach(() => {
  THREE.setConsoleFunction(null);
  vi.restoreAllMocks();
});

function spies() {
  return {
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

describe("threeConsole", () => {
  it("drops exactly the Clock deprecation", () => {
    const c = spies();
    threeConsole("warn", CLOCK_DEPRECATION);
    expect(c.warn).not.toHaveBeenCalled();
  });

  it("passes every other message on as three.js would", () => {
    const c = spies();
    threeConsole("warn", "THREE.WebGLRenderer: Context Lost.", 1);
    threeConsole("warn", `${CLOCK_DEPRECATION} Extra`);
    threeConsole("log", CLOCK_DEPRECATION);
    threeConsole("error", "THREE.Something failed", { detail: true });
    expect(c.warn.mock.calls).toEqual([["THREE.WebGLRenderer: Context Lost.", 1], [`${CLOCK_DEPRECATION} Extra`]]);
    expect(c.log.mock.calls).toEqual([[CLOCK_DEPRECATION]]);
    expect(c.error.mock.calls).toEqual([["THREE.Something failed", { detail: true }]]);
  });

  it("turns a stack trace object into an Error for warn and error, as three.js does", () => {
    const c = spies();
    const trace = { isStackTrace: true, getError: (message) => new Error(`${message} at node.js:1`) };
    threeConsole("warn", "THREE.TSL: Bad node", trace);
    threeConsole("error", "THREE.TSL: Worse node", trace);
    expect(c.warn.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(c.warn.mock.calls[0][0].message).toBe("THREE.TSL: Bad node at node.js:1");
    expect(c.error.mock.calls[0][0].message).toBe("THREE.TSL: Worse node at node.js:1");
  });
});

describe("quietClockDeprecation with the installed three.js", () => {
  it("matches the message three.js sends when a Clock is made", () => {
    const seen = [];
    THREE.setConsoleFunction((type, message) => seen.push([type, message]));
    new THREE.Clock();
    expect(seen).toEqual([["warn", CLOCK_DEPRECATION]]);
  });

  it("makes a Clock silent and leaves three.js's other warnings in place", () => {
    const c = spies();
    quietClockDeprecation();
    new THREE.Clock();
    expect(c.warn).not.toHaveBeenCalled();
    THREE.warn("Something else.", 2);
    expect(c.warn).toHaveBeenCalledWith("THREE.Something else.", 2);
  });

  it("leaves a console function someone else set alone", () => {
    const theirs = vi.fn();
    THREE.setConsoleFunction(theirs);
    quietClockDeprecation();
    expect(THREE.getConsoleFunction()).toBe(theirs);
  });

  it("is still needed: the installed @react-three/fiber still makes a THREE.Clock", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const dist = `${process.cwd()}/node_modules/@react-three/fiber/dist`;
    const usesClock = readdirSync(dist)
      .filter((f) => f.endsWith(".js"))
      .some((f) => readFileSync(`${dist}/${f}`, "utf8").includes("new THREE.Clock()"));
    // When this fails, fiber has moved to THREE.Timer: remove threeConsole.js
    expect(usesClock).toBe(true);
  });
});
