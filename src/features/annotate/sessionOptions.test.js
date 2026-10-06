import { describe, it, expect } from "vitest";
import { CONTRIBUTOR_OPTIONS, sessionOptionsFor } from "./sessionOptions";
import { ALLOWED_SESSION_SIZES, ANNOTATOR_SESSION_SIZES } from "@/util/validators/annotationGet";

describe("sessionOptionsFor", () => {
  it("contributor options match the sizes the API accepts", () => {
    expect(CONTRIBUTOR_OPTIONS.map((o) => o.count)).toEqual(ALLOWED_SESSION_SIZES);
  });

  it("returns the contributor options for the contributor sizes", () => {
    expect(sessionOptionsFor(ALLOWED_SESSION_SIZES)).toEqual(CONTRIBUTOR_OPTIONS);
  });

  it("offers exactly the annotator sizes, without contributor time estimates", () => {
    const opts = sessionOptionsFor(ANNOTATOR_SESSION_SIZES, { annotator: true });
    expect(opts.map((o) => o.count)).toEqual([10, 25, 50]);
    expect(opts.map((o) => o.label)).toEqual(["10", "25", "50"]);
    expect(opts.every((o) => o.time === null)).toBe(true);
  });

  it("pads single-digit labels to two digits", () => {
    expect(sessionOptionsFor([5], { annotator: true })[0].label).toBe("05");
  });

  it("falls back to the contributor options when the sizes are missing or invalid", () => {
    for (const bad of [undefined, null, [], "10,25", [10, "25"], [0], [-5], [2.5]]) {
      expect(sessionOptionsFor(bad)).toEqual(CONTRIBUTOR_OPTIONS);
    }
  });
});
