import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The dependency upgrades for known vulnerabilities (S7, 26 Oct 2026), kept in
 * place: package.json asks for the patched versions, and yarn.lock resolves
 * every package the running app reaches to a version at or above its fix.
 *
 * "Reaches" is the same scope as `yarn audit --groups dependencies`: the
 * dependencies in package.json and everything they pull in, not the
 * devDependencies (test and build tools), which never run on the server.
 */
const root = process.cwd();
const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf8"));
const lockText = readFileSync(`${root}/yarn.lock`, "utf8");

/** x.y.z compared part by part. Pre-release tags are not used by these packages. */
function compare(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

/** yarn.lock v1 as { "name@range": { version, deps: ["name@range", ...] } }. */
function parseLock(text) {
  const entries = {};
  for (const block of text.split(/\n\n+/)) {
    const lines = block.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    if (!lines.length || lines[0].startsWith(" ")) continue;
    const keys = lines[0].replace(/:$/, "").split(", ").map((k) => k.trim().replace(/^"|"$/g, ""));
    const entry = { version: null, deps: [] };
    let inDeps = false;
    for (const line of lines.slice(1)) {
      const version = /^ {2}version "([^"]+)"/.exec(line);
      if (version) entry.version = version[1];
      if (/^ {2}\S/.test(line)) inDeps = /^ {2}(dependencies|optionalDependencies):/.test(line);
      else if (inDeps) {
        const dep = /^ {4}"?([^"\s]+)"? "?([^"]+)"?$/.exec(line);
        if (dep) entry.deps.push(`${dep[1]}@${dep[2]}`);
      }
    }
    for (const key of keys) entries[key] = entry;
  }
  return entries;
}

const lock = parseLock(lockText);
const nameOf = (spec) => spec.slice(0, spec.lastIndexOf("@"));

/** Every name@version the running app reaches, from package.json's dependencies. */
function runtimeCopies() {
  const seen = new Set();
  const copies = new Map();
  const queue = Object.entries(pkg.dependencies).map(([name, range]) => `${name}@${range}`);
  while (queue.length) {
    const spec = queue.shift();
    if (seen.has(spec)) continue;
    seen.add(spec);
    const entry = lock[spec];
    if (!entry) throw new Error(`yarn.lock has no entry for ${spec}`);
    const name = nameOf(spec);
    if (!copies.has(name)) copies.set(name, new Set());
    copies.get(name).add(entry.version);
    queue.push(...entry.deps);
  }
  return copies;
}

/**
 * The lowest safe version for each package the audit of 21 and 26 Oct 2026
 * named, per release line where a package has more than one. A copy on a line
 * not listed here has no known advisory.
 */
const FIXED = {
  next: [{ line: "16.", min: "16.4.1" }],
  "next-auth": [{ line: "4.", min: "4.24.15" }],
  nodemailer: [{ line: "10.", min: "10.1.4" }],
  sharp: [{ line: "0.35.", min: "0.35.5" }],
  postcss: [{ line: "8.", min: "8.5.23" }],
  nanoid: [{ line: "3.", min: "3.3.18" }],
  immutable: [{ line: "5.", min: "5.1.8" }],
  picomatch: [{ line: "4.", min: "4.0.4" }],
  "source-map-js": [{ line: "1.", min: "1.2.2" }],
  "js-cookie": [{ line: "3.", min: "3.0.7" }],
  fflate: [{ line: "0.6.", min: "0.6.11" }, { line: "0.8.", min: "0.8.3" }],
  yaml: [{ line: "1.", min: "1.10.3" }],
  uuid: [{ line: "11.", min: "11.1.1" }],
  "baseline-browser-mapping": [{ line: "2.", min: "2.11.0" }],
};

describe("package.json (S7)", () => {
  it("asks for the patched Next.js, next-auth and nodemailer", () => {
    expect(pkg.dependencies.next).toBe("^16.4.3");
    expect(pkg.dependencies["next-auth"]).toBe("^4.24.15");
    expect(pkg.dependencies.nodemailer).toBe("^10.2.1");
  });

  it("keeps the Next.js lint packages on the same version as Next.js", () => {
    expect(pkg.devDependencies["eslint-config-next"]).toBe(pkg.dependencies.next);
    expect(pkg.devDependencies["@next/eslint-plugin-next"]).toBe(pkg.dependencies.next);
  });

  it("has yarn.lock as its only lockfile (26 Oct 2026)", async () => {
    const { existsSync } = await import("node:fs");
    expect(existsSync(`${root}/package-lock.json`)).toBe(false);
    const ignored = readFileSync(`${root}/.gitignore`, "utf8").split("\n").map((l) => l.trim());
    expect(ignored).toContain("package-lock.json");
  });

  it("still allows only Node.js versions every upgraded package supports", () => {
    // next 16.4 and sharp 0.35 need 20.9, nodemailer 10 needs 20
    expect(pkg.engines.node).toBe(">=20.9.0");
  });
});

describe("yarn.lock (S7)", () => {
  const copies = runtimeCopies();

  it("resolves exactly one Next.js, next-auth and nodemailer for the app, at the versions asked for", () => {
    expect([...copies.get("next")]).toEqual(["16.4.3"]);
    expect([...copies.get("next-auth")]).toEqual(["4.24.15"]);
    expect([...copies.get("nodemailer")]).toEqual(["10.2.1"]);
  });

  it("resolves every package the app reaches at or above its fix", () => {
    for (const [name, rules] of Object.entries(FIXED)) {
      const versions = copies.get(name);
      expect(versions, `${name} is no longer reached at runtime: update FIXED`).toBeDefined();
      for (const version of versions) {
        const rule = rules.find((r) => version.startsWith(r.line));
        if (!rule) continue;
        expect(compare(version, rule.min), `${name}@${version} is below ${rule.min}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("follows only the app's own dependencies, not the test and build tools", () => {
    // The tailwind build pins an older postcss, which never runs on the server
    expect(pkg.devDependencies.postcss).toBe("8.4.49");
    expect(copies.get("postcss").has("8.4.49")).toBe(false);
    expect(copies.has("vitest")).toBe(false);
    expect(copies.has("eslint")).toBe(false);
  });

  it("compares versions part by part", () => {
    expect(compare("16.4.3", "16.4.1")).toBeGreaterThan(0);
    expect(compare("16.10.0", "16.4.1")).toBeGreaterThan(0);
    expect(compare("4.24.13", "4.24.15")).toBeLessThan(0);
    expect(compare("0.35.5", "0.35.5")).toBe(0);
  });
});
