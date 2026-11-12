import { describe, it, expect, afterEach } from "vitest";
import { readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";

/**
 * S25 (12 Nov 2026): Next.js turns every file under src/pages into a route, so
 * a test file there is built into production as an address like
 * /api/health.test (a 500, since vitest is not running) and pulls vitest into
 * the standalone server. The API tests live in src/__tests__/pages/api, with
 * the same folders as the routes they test. This keeps them out.
 */
const TEST_FILE = /\.(test|spec)\.(js|jsx|ts|tsx|mjs)$/;

/** Every test file, and every __tests__ folder, under dir, as paths relative to dir. */
function testFilesUnder(dir) {
  const found = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__") found.push(`${relative(dir, path)}/`);
        else walk(path);
      } else if (TEST_FILE.test(entry.name)) {
        found.push(relative(dir, path));
      }
    }
  };
  walk(dir);
  return found.sort();
}

const PAGES = join(process.cwd(), "src", "pages");

describe("src/pages holds no tests (S25)", () => {
  it("has no test file or __tests__ folder, so none is built as a route", () => {
    const found = testFilesUnder(PAGES);
    expect(found, `Move these out of src/pages, to src/__tests__/pages with the same folders:\n${found.join("\n")}`).toEqual([]);
  });

  it("still has the API routes, so the walk really looked", () => {
    const routes = readdirSync(join(PAGES, "api"));
    expect(routes).toContain("health.js");
    expect(routes).toContain("admin");
  });
});

describe("testFilesUnder", () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  function tree(paths) {
    dir = mkdtempSync(join(tmpdir(), "pages-"));
    for (const path of paths) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      if (!path.endsWith("/")) writeFileSync(join(dir, path), "");
      else mkdirSync(join(dir, path), { recursive: true });
    }
    return dir;
  }

  it("finds .test. and .spec. files of each extension, in any folder", () => {
    tree([
      "api/health.test.js", "api/admin/stats.spec.ts", "api/auth/a.test.jsx",
      "b.spec.tsx", "api/c.test.mjs", "api/getAnnotation/[id].test.js",
    ]);
    expect(testFilesUnder(dir)).toEqual([
      "api/admin/stats.spec.ts", "api/auth/a.test.jsx", "api/c.test.mjs",
      "api/getAnnotation/[id].test.js", "api/health.test.js", "b.spec.tsx",
    ]);
  });

  it("finds a __tests__ folder, even an empty one", () => {
    tree(["api/__tests__/", "api/health.js"]);
    expect(testFilesUnder(dir)).toEqual(["api/__tests__/"]);
  });

  it("leaves routes, pages and styles alone, even with test in the name", () => {
    tree([
      "api/health.js", "api/contest.js", "latest.jsx", "test.jsx", "api/testing/index.ts",
      "_app/globals.scss", "getAnnotation/[id].js", "api/auth/[...nextauth].js",
    ]);
    expect(testFilesUnder(dir)).toEqual([]);
  });
});
