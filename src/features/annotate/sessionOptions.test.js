import { describe, it, expect } from "vitest";
import { CONTRIBUTOR_OPTIONS, FIRST_SESSION, sessionOptionsFor } from "./sessionOptions";
import { ALLOWED_SESSION_SIZES, ANNOTATOR_SESSION_SIZES } from "@/util/validators/annotationGet";

describe("the picker's times (S29, 16 Nov 2026)", () => {
  it("are 4-5, 8-10, 15-20 and 30-40 minutes, from 46 to 57 s a photo", () => {
    expect(CONTRIBUTOR_OPTIONS.map((o) => [o.count, o.time])).toEqual([
      [5, "4-5 minutes"],
      [10, "8-10 minutes"],
      [20, "15-20 minutes"],
      [40, "30-40 minutes"],
    ]);
  });

  it("ends the 5-photo range at the first session's minutes, the figure the emails give", () => {
    expect(FIRST_SESSION).toEqual({ photos: 5, minutes: 5 });
    const first = CONTRIBUTOR_OPTIONS.find((o) => o.count === FIRST_SESSION.photos);
    expect(first.time).toBe(`4-${FIRST_SESSION.minutes} minutes`);
  });
});

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
