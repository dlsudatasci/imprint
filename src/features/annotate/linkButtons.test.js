import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A link wrapping a Button takes tabIndex={-1}, so Tab stops once, on the
 * Button (17 Oct 2026, apple-design check of the annotate screens, the same
 * rule as the home page and the dashboard). Without it, Tab stopped on the
 * link and then on the Button inside it.
 */
const FILES = ["src/features/annotate/selection.jsx", "src/features/annotate/done.jsx"];

describe("link-wrapped buttons on the annotate screens", () => {
  for (const file of FILES) {
    it(`are one Tab stop in ${file}`, () => {
      const src = readFileSync(`${process.cwd()}/${file}`, "utf8");
      const wrapped = [...src.matchAll(/<Link\b([^>]*)>\s*<Button\b/g)];
      expect(wrapped.length).toBeGreaterThan(0);
      for (const [, attrs] of wrapped) expect(attrs).toContain("tabIndex={-1}");
    });
  }
});
