import { describe, it, expect } from "vitest";
import { toggleHiddenId, withoutHiddenId, BOX_VISIBILITY_COPY } from "./boxVisibility";

// Hiding boxes on the photo in Step 1 (8 Oct 2026)
describe("toggleHiddenId", () => {
  it("adds an id that is not hidden and removes one that is", () => {
    expect(toggleHiddenId([], "a")).toEqual(["a"]);
    expect(toggleHiddenId(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleHiddenId(["a"], "b")).toEqual(["a", "b"]);
  });

  it("never mutates, and treats a missing list as empty", () => {
    const ids = ["a"];
    toggleHiddenId(ids, "b");
    toggleHiddenId(ids, "a");
    expect(ids).toEqual(["a"]);
    expect(toggleHiddenId(undefined, "a")).toEqual(["a"]);
  });
});

describe("withoutHiddenId", () => {
  it("removes the id, and returns the same array when it was not hidden", () => {
    expect(withoutHiddenId(["a", "b"], "a")).toEqual(["b"]);
    const ids = ["a"];
    expect(withoutHiddenId(ids, "z")).toBe(ids);
    expect(withoutHiddenId(null, "a")).toEqual([]);
  });
});

describe("BOX_VISIBILITY_COPY", () => {
  it("names the object and the count, with no em dash or semicolon", () => {
    expect(BOX_VISIBILITY_COPY.hide("Tree")).toBe("Hide Tree on the photo");
    expect(BOX_VISIBILITY_COPY.show("Tree")).toBe("Show Tree on the photo");
    expect(BOX_VISIBILITY_COPY.hiddenCount(1)).toBe("1 box hidden");
    expect(BOX_VISIBILITY_COPY.hiddenCount(3)).toBe("3 boxes hidden");
    for (const s of [BOX_VISIBILITY_COPY.hide("X"), BOX_VISIBILITY_COPY.show("X"), BOX_VISIBILITY_COPY.hiddenCount(2), BOX_VISIBILITY_COPY.showAll]) {
      expect(s).not.toMatch(/—|;/);
    }
  });
});
