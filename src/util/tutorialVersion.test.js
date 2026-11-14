import { describe, it, expect } from "vitest";
import { tutorialImageCount, tutorialVersionFor, TUTORIAL_IMAGE_COUNTS, TUTORIAL_VERSIONS, FINISH_TUTORIAL_LABEL } from "./tutorialVersion";
import TUTORIAL_IMAGES from "@/data/tutorialImages";

// S30 (14 Nov 2026): a one-photo tutorial for contributors
describe("the tutorial's length and version", () => {
  it("is one photo, version 2, for contributors, and three photos, version 1, for annotators", () => {
    expect(tutorialImageCount()).toBe(1);
    expect(tutorialImageCount(false)).toBe(1);
    expect(tutorialImageCount(true)).toBe(3);
    expect(tutorialVersionFor(false)).toBe(2);
    expect(tutorialVersionFor(true)).toBe(1);
    expect(TUTORIAL_IMAGE_COUNTS).toEqual({ contributor: 1, annotator: 3 });
    expect(TUTORIAL_VERSIONS).toEqual({ contributor: 2, annotator: 1 });
    expect(Object.isFrozen(TUTORIAL_IMAGE_COUNTS) && Object.isFrozen(TUTORIAL_VERSIONS)).toBe(true);
  });

  it("keeps the three tutorial photos, which annotators still use", () => {
    expect(TUTORIAL_IMAGES).toHaveLength(TUTORIAL_IMAGE_COUNTS.annotator);
  });

  it("names the last photo's button Finish Tutorial", () => {
    expect(FINISH_TUTORIAL_LABEL).toBe("Finish Tutorial");
  });
});
