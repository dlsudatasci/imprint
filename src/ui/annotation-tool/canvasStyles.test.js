import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Photo frame fix (9 Oct 2026): the photo is painted on .rp-image and the
// boxes and sidewalk points on .rp-shapes, stacked on top. A border or padding
// on either canvas shrinks its drawing area under border-box sizing, so the
// photo and the boxes drift apart. Neither stylesheet may give them one.
const STYLESHEETS = [
  "src/pages/_app/globals.scss",
  "src/ui/annotation-tool/Toolstyles.css",
];

// The declarations of every rule whose selector names the class, comments removed
function rulesFor(css, className) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    if (new RegExp(`\\.${className}(?![\\w-])`).test(m[1])) rules.push(m[2]);
  }
  return rules;
}

describe("annotation canvases", () => {
  it("gives neither .rp-image nor .rp-shapes a border or padding in any stylesheet", () => {
    for (const file of STYLESHEETS) {
      const css = readFileSync(path.resolve(process.cwd(), file), "utf8");
      for (const className of ["rp-image", "rp-shapes"]) {
        const rules = rulesFor(css, className);
        // Both files style both canvases, so an empty match means the parser missed them
        expect(rules.length, `${file} .${className}`).toBeGreaterThan(0);
        for (const body of rules) {
          expect(body, `${file} .${className}`).not.toMatch(/(^|[\s;])border(-[a-z-]+)?\s*:/);
          expect(body, `${file} .${className}`).not.toMatch(/(^|[\s;])padding(-[a-z-]+)?\s*:/);
        }
      }
    }
  });
});
