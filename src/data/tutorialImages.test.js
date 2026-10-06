import { describe, it, expect } from "vitest";
import TUTORIAL_IMAGES from "./tutorialImages";

describe("tutorialImages", () => {
  it("has exactly 3 images", () => {
    expect(TUTORIAL_IMAGES).toHaveLength(3);
  });

  it("every image has the required fields for the annotation form", () => {
    const requiredFields = ["_id", "imageID", "url", "city", "modelVersion", "isReference", "annotationList"];
    for (const img of TUTORIAL_IMAGES) {
      for (const field of requiredFields) {
        expect(img).toHaveProperty(field);
      }
    }
  });

  it("every image URL points to the static tutorial directory", () => {
    for (const img of TUTORIAL_IMAGES) {
      expect(img.url).toMatch(/^\/images\/tutorial\/tutorial-\d+\.jpg$/);
    }
  });

  it("every image ID uses the TUTORIAL- prefix", () => {
    for (const img of TUTORIAL_IMAGES) {
      expect(img.imageID).toMatch(/^TUTORIAL-/);
      expect(img._id).toMatch(/^TUTORIAL-/);
    }
  });

  it("every image has at least one annotation box", () => {
    for (const img of TUTORIAL_IMAGES) {
      expect(img.annotationList.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every annotation box has the required shape fields", () => {
    const requiredBoxFields = ["id", "comment", "mark", "selected", "editable", "isRejected"];
    const requiredMarkFields = ["x", "y", "width", "height", "type"];

    for (const img of TUTORIAL_IMAGES) {
      for (const box of img.annotationList) {
        for (const field of requiredBoxFields) {
          expect(box).toHaveProperty(field);
        }
        for (const field of requiredMarkFields) {
          expect(box.mark).toHaveProperty(field);
        }
      }
    }
  });

  it("all annotation boxes start as unselected model suggestions", () => {
    for (const img of TUTORIAL_IMAGES) {
      for (const box of img.annotationList) {
        expect(box.selected).toBe(false);
        expect(box.editable).toBe(false);
        expect(box.isRejected).toBe(false);
      }
    }
  });

  it("all annotation boxes have RECT type marks", () => {
    for (const img of TUTORIAL_IMAGES) {
      for (const box of img.annotationList) {
        expect(box.mark.type).toBe("RECT");
      }
    }
  });

  it("all annotation boxes have non-empty comment labels", () => {
    for (const img of TUTORIAL_IMAGES) {
      for (const box of img.annotationList) {
        expect(box.comment).toBeTruthy();
        expect(typeof box.comment).toBe("string");
      }
    }
  });

  it("all box IDs are unique across all images", () => {
    const allIds = TUTORIAL_IMAGES.flatMap((img) =>
      img.annotationList.map((box) => box.id)
    );
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("all image IDs are unique", () => {
    const ids = TUTORIAL_IMAGES.map((img) => img.imageID);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("provides a variety of obstruction types across the three images", () => {
    const allLabels = TUTORIAL_IMAGES.flatMap((img) =>
      img.annotationList.map((box) => box.comment)
    );
    const unique = new Set(allLabels);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it("bounding boxes have positive dimensions within canvas bounds", () => {
    const CANVAS_W = 960;
    const CANVAS_H = 600;
    for (const img of TUTORIAL_IMAGES) {
      for (const box of img.annotationList) {
        const { x, y, width, height } = box.mark;
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + width).toBeLessThanOrEqual(CANVAS_W);
        expect(y + height).toBeLessThanOrEqual(CANVAS_H);
      }
    }
  });
});
